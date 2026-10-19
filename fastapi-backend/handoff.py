import asyncio
import json
import secrets
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from config import redis, HANDOFF_SECRET, HANDOFF_TIMEOUT_SECONDS
from online_agent import online_agents
from logger_s import get_logger

router = APIRouter()
logger = get_logger(__name__)

# the popup shows the first 200 (SUMMARY_MAX_CHARS in config.js)
SUMMARY_MAX_CHARS = 500
RESULT_TTL_SECONDS = 120    # "accepted" / "declined" stay readable for my-agent
# after Accept, the card lives for the call (step 4)
CARD_TTL_SECONDS = 7200
SEND_TIMEOUT_SECONDS = 5    # one stuck dashboard must not hold up the others

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


async def send_alert(websocket, alert: dict) -> bool:
    """True if the alert reached this dashboard."""
    try:
        await asyncio.wait_for(websocket.send_json(alert), timeout=SEND_TIMEOUT_SECONDS)
        return True
    except Exception:
        return False


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
    delivered = await asyncio.gather(*(send_alert(ws, alert) for _, ws in targets))

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
