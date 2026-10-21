import asyncio
import json
import secrets
import time
import uuid
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from livekit import api as lk_api

from config import (
    redis,
    HANDOFF_SECRET,
    HANDOFF_TIMEOUT_SECONDS,
    LIVEKIT_URL,
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
)
from online_agent import online_agents, add_open_alert
from logger_s import get_logger

router = APIRouter()
logger = get_logger(__name__)

# the popup shows the first 200 (SUMMARY_MAX_CHARS in config.js)
SUMMARY_MAX_CHARS = 500
RESULT_TTL_SECONDS = 120    # "accepted" / "declined" stay readable for my-agent
# after Accept, the card lives for the call (step 4)
CARD_TTL_SECONDS = 7200
SEND_TIMEOUT_SECONDS = 5    # one stuck dashboard must not hold up the others
RESUME_SECRET_BYTES = 32    # size of the random resume secret (step 2)

# Results of record_decline() / try_accept()
DECLINE_IGNORED = 0         # not waiting any more, or this dashboard was not alerted
DECLINE_COUNTED = 1
DECLINE_ALL = 2             # every alerted dashboard declined -> status "declined"
ACCEPT_TOO_LATE = 0         # already accepted / declined / expired
ACCEPT_WON = 1
ACCEPT_NOT_ALERTED = -1     # this dashboard never got this alert


# ---------- Lua scripts (each runs as one step inside Redis) ----------

# KEYS: status, alerted, card | ARGV: ttl, card_json, connection IDs...
CREATE_SCRIPT = """
redis.call('SET', KEYS[ 3 ], ARGV[ 2 ], 'EX', ARGV[ 1 ])
for i = 3, #ARGV do
  redis.call('SADD', KEYS[ 2 ], ARGV[ i ])
end
redis.call('EXPIRE', KEYS[ 2 ], ARGV[ 1 ])
redis.call('SET', KEYS[ 1 ], 'waiting', 'EX', ARGV[ 1 ])
return 1
"""

# KEYS: status, alerted, declined | ARGV: connection_id, result_ttl, set_ttl
DECLINE_SCRIPT = """
if redis.call('GET', KEYS[ 1 ]) ~= 'waiting' then return 0 end
if redis.call('SISMEMBER', KEYS[ 2 ], ARGV[ 1 ]) == 0 then return 0 end
redis.call('SADD', KEYS[ 3 ], ARGV[ 1 ])
redis.call('EXPIRE', KEYS[ 3 ], ARGV[ 3 ])
if redis.call('SCARD', KEYS[ 3 ]) >= redis.call('SCARD', KEYS[ 2 ]) then
  redis.call('SET', KEYS[ 1 ], 'declined', 'EX', ARGV[ 2 ])
  return 2
end
return 1
"""

# KEYS: status, alerted, card, winner | ARGV: connection_id, result_ttl, card_ttl
ACCEPT_SCRIPT = """
if redis.call('GET', KEYS[ 1 ]) ~= 'waiting' then return 0 end
if redis.call('SISMEMBER', KEYS[ 2 ], ARGV[ 1 ]) == 0 then return -1 end
redis.call('SET', KEYS[ 1 ], 'accepted', 'EX', ARGV[ 2 ])
redis.call('SET', KEYS[ 4 ], ARGV[ 1 ], 'EX', ARGV[ 3 ])
redis.call('EXPIRE', KEYS[ 3 ], ARGV[ 3 ])
return 1
"""


def handoff_keys(handoff_id: str) -> dict:
    base = "handoff:{" + handoff_id + "}"
    return {
        "status": base + ":status",
        "alerted": base + ":alerted",
        "declined": base + ":declined",
        "card": base + ":card",
        "winner": base + ":winner",
        "resume": base + ":resume",     # step 2: secret that proves "I am the winner"
    }


# ---------- Judge functions (also used by the dashboard socket in B3) ----------

async def record_decline(handoff_id: str, connection_id: str) -> int:
    """A dashboard declined (or could not be reached). Returns DECLINE_*."""
    keys = handoff_keys(handoff_id)
    result = await redis.eval(
        DECLINE_SCRIPT,
        keys=[keys["status"], keys["alerted"], keys["declined"]],
        args=[connection_id, str(RESULT_TTL_SECONDS),
              str(HANDOFF_TIMEOUT_SECONDS)],
    )
    return int(result)


async def try_accept(handoff_id: str, connection_id: str) -> int:
    """First Accept wins. Returns ACCEPT_*."""
    keys = handoff_keys(handoff_id)
    result = await redis.eval(
        ACCEPT_SCRIPT,
        keys=[keys["status"], keys["alerted"], keys["card"], keys["winner"]],
        args=[connection_id, str(RESULT_TTL_SECONDS), str(CARD_TTL_SECONDS)],
    )
    return int(result)


# ---------- Joining the call (step 2) ----------

def to_text(value) -> Optional[str]:
    """Redis can hand back text or bytes. Always return text (or None)."""
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return str(value)


async def read_card(handoff_id: str) -> Optional[dict]:
    """The saved handoff card, or None if it is gone or not readable."""
    raw = await redis.get(handoff_keys(handoff_id)["card"])
    if raw is None:
        return None
    if isinstance(raw, (str, bytes)):
        raw = json.loads(to_text(raw))
    return raw if isinstance(raw, dict) else None


def human_identity(handoff_id: str) -> str:
    """The human agent's name inside the LiveKit room.

    Same handoff -> same identity, so after a refresh the new connection
    replaces the old one. A different call -> a different identity, so a stale
    tab from an old call can never push this call's agent out.
    """
    return "human-" + handoff_id[:12]


def make_room_pass(room_name: str, identity: str, ttl_seconds: int) -> str:
    """A signed LiveKit pass: this identity may join ONLY this room,
    may speak and listen, and it stops working after ttl_seconds."""
    token = (
        lk_api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_grants(lk_api.VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
        ))
        .with_ttl(timedelta(seconds=ttl_seconds))
    )
    return token.to_jwt()


async def start_call_access(handoff_id: str, connection_id: str) -> Optional[dict]:
    """The winner just won. Save a resume secret and make the first room pass.

    Returns the fields to add to the "accepted" message, or None if anything
    failed (the caller then sends the winner a clear error).
    Never logs the secret or the pass.
    """
    try:
        card = await read_card(handoff_id)
        room_name = card.get("room_name") if card else None
        if not isinstance(room_name, str) or not room_name:
            logger.error(
                f"Handoff {handoff_id[:8]}: card or room_name missing")
            return None

        resume_secret = secrets.token_urlsafe(RESUME_SECRET_BYTES)
        await redis.set(
            handoff_keys(handoff_id)["resume"], resume_secret,
            ex=CARD_TTL_SECONDS)

        room_token = make_room_pass(
            room_name, human_identity(handoff_id), CARD_TTL_SECONDS)
        return {
            "livekit_url": LIVEKIT_URL,
            "room_name": room_name,
            "room_token": room_token,
            "resume_secret": resume_secret,
            "expires_in": CARD_TTL_SECONDS,
        }
    except Exception as error:
        logger.error(
            f"Handoff {handoff_id[:8]}: room pass not made: {type(error).__name__}")
        return None


async def resume_call(handoff_id: str, connection_id: str,
                      provided_secret: str) -> Optional[dict]:
    """After a refresh: the new socket proves it is the winner with the secret.

    On success the winner key moves to the new connection ID and a fresh pass
    is returned. The pass only lasts for what is left of the call's 2 hours.
    Returns None for any failure (wrong secret, call over, Redis problem).
    """
    try:
        keys = handoff_keys(handoff_id)
        stored = to_text(await redis.get(keys["resume"]))
        if stored is None:
            return None
        # constant-time check, same idea as the login
        if not secrets.compare_digest(
                provided_secret.encode("utf-8"), stored.encode("utf-8")):
            logger.warning(
                f"Handoff {handoff_id[:8]}: resume refused (wrong secret)")
            return None

        remaining = int(await redis.ttl(keys["resume"]))
        if remaining <= 0:
            return None

        card = await read_card(handoff_id)
        room_name = card.get("room_name") if card else None
        if not isinstance(room_name, str) or not room_name:
            return None

        await redis.set(keys["winner"], connection_id, ex=remaining)
        room_token = make_room_pass(
            room_name, human_identity(handoff_id), remaining)
        return {
            "livekit_url": LIVEKIT_URL,
            "room_name": room_name,
            "room_token": room_token,
            "expires_in": remaining,
        }
    except Exception as error:
        logger.error(
            f"Handoff {handoff_id[:8]}: resume failed: {type(error).__name__}")
        return None


async def end_call_cleanup(handoff_id: str, connection_id: str) -> bool:
    """The winner ended the call: delete the resume secret and the winner key,
    so an old secret can never open the room again.

    Only the CURRENT winner may do this. Returns True if it was cleared.
    If the dashboard socket is already gone, this never runs; the keys then
    expire by themselves after CARD_TTL_SECONDS.
    """
    try:
        keys = handoff_keys(handoff_id)
        winner = to_text(await redis.get(keys["winner"]))
        if winner != connection_id:
            logger.warning(
                f"Handoff {handoff_id[:8]}: end call refused (not the winner)")
            return False
        await redis.delete(keys["resume"])
        await redis.delete(keys["winner"])
        return True
    except Exception as error:
        logger.error(
            f"Handoff {handoff_id[:8]}: end call cleanup failed: {type(error).__name__}")
        return False


# ---------- Helpers ----------

def secret_ok(provided: Optional[str]) -> bool:
    """Constant-time check, same idea as the login."""
    return secrets.compare_digest(
        (provided or "").encode("utf-8"), HANDOFF_SECRET.encode("utf-8"))


def clean_summary(text: str) -> str:
    """Collapse spaces/new lines and cut to SUMMARY_MAX_CHARS."""
    text = " ".join(text.split())
    if len(text) <= SUMMARY_MAX_CHARS:
        return text
    return text[:SUMMARY_MAX_CHARS - 1].rstrip() + "…"


async def send_alert(connection_id: str, websocket, alert: dict) -> bool:
    """True if the alert reached this dashboard.

    B3: when it does, remember it as an open alert for this dashboard, so a
    later disconnect can count as a decline and a win can tell it "taken".
    """
    try:
        await asyncio.wait_for(websocket.send_json(alert), timeout=SEND_TIMEOUT_SECONDS)
    except Exception:
        return False
    add_open_alert(connection_id, alert["handoff_id"])
    return True


# ---------- Route ----------

class HandoffRequest(BaseModel):
    room_name: str = Field(min_length=1, max_length=100)
    # The AI's summary of the call. If the order ID is known, it is IN the summary.
    summary: str = Field(default="", max_length=4000)


@router.post("/agent/handoff")
async def request_handoff(
    body: HandoffRequest,
    x_handoff_secret: Optional[str] = Header(default=None),
):
    # 1. Only my-agent may ask (shared secret, never the dashboard token)
    if not secret_ok(x_handoff_secret):
        logger.warning("Handoff refused: bad secret")
        raise HTTPException(status_code=401, detail="Unauthorized")

    room_name = body.room_name.strip()
    if not room_name:
        raise HTTPException(status_code=400, detail="room_name needed")
    summary = clean_summary(body.summary)

    # 2. Who is online right now? (copy, the list can change while we send)
    targets = list(online_agents.items())  # 1
    if not targets:
        logger.info("Handoff: no agents online")
        return {"handoff_id": None, "status": "no_agents", "agents_alerted": 0}

    # 3. Save the handoff in Redis BEFORE alerting, so an Accept always finds it
    handoff_id = uuid.uuid4().hex
    keys = handoff_keys(handoff_id)
    card = json.dumps({
        "room_name": room_name,
        "summary": summary,
        "created_at": int(time.time()),
    })
    try:
        await redis.eval(
            CREATE_SCRIPT,
            keys=[keys["status"], keys["alerted"], keys["card"]],
            args=[str(HANDOFF_TIMEOUT_SECONDS), card] +
            [cid for cid, _ in targets],
        )
    except Exception as error:
        logger.error(f"Handoff not saved (Redis): {type(error).__name__}")
        raise HTTPException(status_code=503, detail="Handoff unavailable")

    # 4. Alert every dashboard at the same time
    alert = {"type": "incoming", "handoff_id": handoff_id, "summary": summary}
    delivered = await asyncio.gather(
        *(send_alert(cid, ws, alert) for cid, ws in targets))

    # 5. A dashboard that could not be reached counts as a decline (option ii),
    #    so "everyone declined" still works when one of them is gone.
    status = "waiting"
    for (connection_id, _), ok in zip(targets, delivered):
        if ok:
            continue
        try:
            if await record_decline(handoff_id, connection_id) == DECLINE_ALL:
                status = "no_agents"
        except Exception as error:
            logger.error(
                f"Handoff decline not saved (Redis): {type(error).__name__}")

    alerted = sum(delivered)
    # Log the short ID and counts only - never the summary (customer details)
    logger.info(
        f"Handoff {handoff_id[:8]}: alerted {alerted} of {len(targets)} dashboards")
    return {"handoff_id": handoff_id, "status": status, "agents_alerted": alerted}
