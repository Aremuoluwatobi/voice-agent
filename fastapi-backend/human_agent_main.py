from fastapi import (
    APIRouter,
    HTTPException,
    Depends,
    WebSocket,
    WebSocketDisconnect
)
from config import (
    LOGIN_PASSWORD,
    LOGIN_EMAIL,
    EXPIRE_TIME,
    ALGORITHM,
    SECRET_KEY,
    FRONTEND_ORIGIN,
    AUTH_TIMEOUT_SECONDS,
    MAX_MESSAGE_CHARS,
    POLICY_VIOLATION,
    HEARTBEAT_TIMEOUT_SECONDS,
    RATE_LIMIT_MESSAGES,
    RATE_LIMIT_WINDOW_SECONDS
)
from online_agent import (
    add_agent,
    remove_agent,
    online_count,
    online_agents,
    close_open_alert,
    close_alert_everywhere,
    take_open_alerts,
)
from handoff import (
    try_accept,
    record_decline,
    start_call_access,
    resume_call,
    end_call_cleanup,
    ACCEPT_WON,
    ACCEPT_TOO_LATE,
    ACCEPT_NOT_ALERTED,
)
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from route_gaurd import secure_route
from logger_s import get_logger
from route_gaurd import verify_token, TokenCheckError
from typing import Optional
import secrets
import jwt
import asyncio
import json
import time


router = APIRouter()

logger = get_logger(__name__)

# B3: a handoff_id from the dashboard must be a text of at most this length
HANDOFF_ID_MAX_CHARS = 100
# Step 2: the resume secret from the dashboard must be a text of at most this length
RESUME_SECRET_MAX_CHARS = 200
# One stuck dashboard must not hold up the others (same idea as handoff.py)
NOTIFY_TIMEOUT_SECONDS = 5


class AuthRequest(BaseModel):
    email: str
    password: str


@router.post("/agent/login")
def agent_login(login_info: AuthRequest):
    # strip white spacing and owner text
    strip_lower_email = login_info.email.strip().lower()
    # check for empty string
    if not strip_lower_email or not login_info.password:
        raise HTTPException(
            status_code=400, detail="Email and password needed")
    # encode user password and email due to secrets.compare_digest()
    encode_user_email = strip_lower_email.encode("utf-8")
    encode_user_password = login_info.password.encode("utf-8")
    # encode system password and email due to secrets.compare_digest()
    encode_system_password = LOGIN_PASSWORD.encode("utf-8")
    encode_system_email = LOGIN_EMAIL.encode("utf-8")
    # check user email against system email
    checked_email = secrets.compare_digest(
        encode_user_email, encode_system_email)
    # check user password against system password
    checked_password = secrets.compare_digest(
        encode_user_password, encode_system_password)

    if checked_email and checked_password:
        logger.info(f"Successfully logged in")
        expired_time = datetime.now(
            timezone.utc) + timedelta(minutes=EXPIRE_TIME)

        token_payload = {
            "sub": strip_lower_email,
            "exp": expired_time.timestamp()
        }

        token_room_access = jwt.encode(
            token_payload, SECRET_KEY, algorithm=ALGORITHM)

        return {"status": "successful", "token": token_room_access}
    else:
        logger.error("Failed log in")
        raise HTTPException(
            status_code=401, detail="Email or Password is wrong")


@router.get("/agent/dashboard")
def Get_agent_dashboard(guard=Depends(secure_route)):
    return {"hi": guard}


async def receive_text_message(websocket: WebSocket, timeout: float):
    """Wait for one message. Returns its text, or None if it was not text.
    Raises asyncio.TimeoutError on timeout and WebSocketDisconnect if the browser left."""
    message = await asyncio.wait_for(websocket.receive(), timeout=timeout)
    if message["type"] == "websocket.disconnect":
        raise WebSocketDisconnect(message.get("code", 1000))
    return message.get("text")


async def close_policy(websocket: WebSocket, reason: str):
    logger.warning(f"Dashboard socket closed: {reason}")
    # Short code for the browser, e.g. "auth_timeout", "invalid_token", "expired", "bad_message"
    code = "bad_message" if reason.startswith(
        "bad message") else reason.replace(" ", "_")
    # 1. Tell the browser why (normal messages get through Render; close codes don't)
    try:
        await websocket.send_json({"type": "closing", "reason": code})
    except Exception:
        logger.info("Closing notice not delivered (browser already gone)")
    # 2. Then close with 1008 as the standard signal
    try:
        await websocket.close(code=POLICY_VIOLATION)
    except Exception:
        logger.info("Close not delivered (browser already gone)")
    logger.warning(f"Dashboard socket close sent: {reason}")


async def close_quietly(websocket: WebSocket, reason: str):
    """Close WITHOUT a 'closing' message, so the dashboard reconnects instead of going to login.
    Used for heartbeat timeout and for 'leaving'."""
    logger.info(f"Dashboard socket closed: {reason}")
    try:
        await websocket.close()
    except Exception:
        logger.info("Close not delivered (browser already gone)")


def message_type_for_log(message) -> str:
    """Only the message type is ever logged (never the content, which could hold a token).
    Cut to 30 characters and stripped of new lines so it cannot fake extra log lines."""
    if isinstance(message, dict) and isinstance(message.get("type"), str):
        return "".join(c for c in message["type"][:30] if c.isprintable())
    return "(no type)"


# ---------- Accept / decline (B3) ----------

def read_handoff_id(message: dict) -> Optional[str]:
    """The handoff_id from an accept/decline message, or None if it is not valid."""
    value = message.get("handoff_id")
    if isinstance(value, str) and 0 < len(value) <= HANDOFF_ID_MAX_CHARS:
        return value
    return None


def read_resume_secret(message: dict) -> Optional[str]:
    """The resume secret from a resume message, or None if it is not valid."""
    value = message.get("resume_secret")
    if isinstance(value, str) and 0 < len(value) <= RESUME_SECRET_MAX_CHARS:
        return value
    return None


async def send_quietly(websocket, payload: dict) -> bool:
    """Send one message. True if it went out. Never raises."""
    try:
        await asyncio.wait_for(
            websocket.send_json(payload), timeout=NOTIFY_TIMEOUT_SECONDS)
        return True
    except Exception:
        return False


async def notify_taken(handoff_id: str, connection_ids: list) -> None:
    """Tell the dashboards that lost the race, so their popup closes."""
    payload = {"type": "taken", "handoff_id": handoff_id}
    sends = []
    for connection_id in connection_ids:
        other_socket = online_agents.get(connection_id)
        if other_socket is not None:
            sends.append(send_quietly(other_socket, payload))
    if sends:
        await asyncio.gather(*sends)


async def handle_accept(websocket: WebSocket, connection_id: str, message: dict):
    """First Accept wins. Redis is the judge (try_accept)."""
    handoff_id = read_handoff_id(message)
    if handoff_id is None:
        logger.info("Accept ignored: bad handoff_id")
        return

    try:
        result = await try_accept(handoff_id, connection_id)
    except Exception as error:
        # Redis problem: this dashboard did not win, so tell it "too late".
        logger.error(f"Accept failed (Redis): {type(error).__name__}")
        result = ACCEPT_TOO_LATE

    if result == ACCEPT_WON:
        # Remove the alert everywhere, then tell the others they lost.
        holders = close_alert_everywhere(handoff_id)
        losers = [cid for cid in holders if cid != connection_id]

        # Step 2: only the winner gets a room pass and a resume secret.
        access = await start_call_access(handoff_id, connection_id)
        accepted = {"type": "accepted", "handoff_id": handoff_id}
        if access is not None:
            accepted.update(access)
        await send_quietly(websocket, accepted)
        if access is None:
            # The call is accepted but this dashboard cannot join it.
            await send_quietly(
                websocket,
                {"type": "call_error", "handoff_id": handoff_id,
                 "reason": "join_unavailable"})

        await notify_taken(handoff_id, losers)
        logger.info(
            f"Handoff {handoff_id[:8]} accepted; {len(losers)} other dashboards told")
    elif result == ACCEPT_TOO_LATE:
        close_open_alert(connection_id, handoff_id)
        await send_quietly(
            websocket, {"type": "too_late", "handoff_id": handoff_id})
        logger.info(f"Handoff {handoff_id[:8]}: accept came too late")
    elif result == ACCEPT_NOT_ALERTED:
        logger.warning(
            f"Handoff {handoff_id[:8]}: accept from a dashboard that was not alerted")


async def handle_resume(websocket: WebSocket, connection_id: str, message: dict):
    """After a refresh: prove "I am the winner" with the resume secret, take the
    call back on this new connection, and get a fresh room pass."""
    handoff_id = read_handoff_id(message)
    resume_secret = read_resume_secret(message)
    if handoff_id is None or resume_secret is None:
        logger.info("Resume ignored: bad handoff_id or secret")
        await send_quietly(
            websocket, {"type": "resume_failed", "handoff_id": handoff_id})
        return

    access = await resume_call(handoff_id, connection_id, resume_secret)
    if access is None:
        await send_quietly(
            websocket, {"type": "resume_failed", "handoff_id": handoff_id})
        return

    resumed = {"type": "resumed", "handoff_id": handoff_id}
    resumed.update(access)
    await send_quietly(websocket, resumed)
    logger.info(f"Handoff {handoff_id[:8]}: call resumed on a new connection")


async def handle_end_call(websocket: WebSocket, connection_id: str, message: dict):
    """The winner pressed End call: delete the resume secret on the server.
    Only the current winner can do this. The dashboard must work even if this
    message never arrives (socket already closed), so the keys also expire
    by themselves after 2 hours."""
    handoff_id = read_handoff_id(message)
    if handoff_id is None:
        logger.info("End call ignored: bad handoff_id")
        return

    cleared = await end_call_cleanup(handoff_id, connection_id)
    await send_quietly(
        websocket,
        {"type": "call_cleared", "handoff_id": handoff_id, "cleared": cleared})
    if cleared:
        logger.info(f"Handoff {handoff_id[:8]}: call access cleared")


async def handle_decline(connection_id: str, message: dict):
    """The popup is hidden on the dashboard already. Count the decline."""
    handoff_id = read_handoff_id(message)
    if handoff_id is None:
        logger.info("Decline ignored: bad handoff_id")
        return

    close_open_alert(connection_id, handoff_id)
    try:
        result = await record_decline(handoff_id, connection_id)
    except Exception as error:
        logger.error(f"Decline not saved (Redis): {type(error).__name__}")
        return
    logger.info(
        f"Handoff {handoff_id[:8]}: decline recorded (result {result})")


async def decline_open_alerts(connection_id: str):
    """A dashboard is gone: count it as a decline for every alert it still had
    open, so the AI does not wait the full 30 s. Safe to call twice."""
    for handoff_id in take_open_alerts(connection_id):
        try:
            await record_decline(handoff_id, connection_id)
        except Exception as error:
            logger.error(
                f"Decline on disconnect not saved (Redis): {type(error).__name__}")


@router.websocket("/agent/ws")
async def agent_websocket(websocket: WebSocket):
    # 1. Origin check, before accepting
    if websocket.headers.get("origin") != FRONTEND_ORIGIN:
        logger.warning("Dashboard socket refused: bad origin")
        await websocket.close(code=POLICY_VIOLATION)
        return

    # 2. Accept
    await websocket.accept()

    connection_id = None

    try:
        # 3. First message within 5 seconds
        data = await receive_text_message(websocket, AUTH_TIMEOUT_SECONDS)

        # 4. Message checks
        if data is None:
            await close_policy(websocket, "bad message (not text)")
            return
        if len(data) > MAX_MESSAGE_CHARS:
            await close_policy(websocket, "bad message (too large)")
            return
        message = json.loads(data)
        if not isinstance(message, dict) or message.get("type") != "auth":
            await close_policy(websocket, "bad message (not auth)")
            return

        # 5. Token check (raises TokenCheckError on failure)
        decoded = verify_token(message.get("token"))
        expires_at = decoded["exp"]

        # 6. Success
        await websocket.send_json({"type": "ok"})

        connection_id = add_agent(websocket)

        # 7. Main loop: heartbeat, message rules, expiry (piece 4)
        recent_messages = []  # times of recent messages, for the rate limit
        while True:
            seconds_left = expires_at - time.time()
            if seconds_left <= 0:
                await close_policy(websocket, "expired")
                return

            token_ends_first = seconds_left <= HEARTBEAT_TIMEOUT_SECONDS
            try:
                data = await receive_text_message(
                    websocket, min(HEARTBEAT_TIMEOUT_SECONDS, seconds_left))
            except asyncio.TimeoutError:
                if token_ends_first:
                    # -> login
                    await close_policy(websocket, "expired")
                else:
                    # -> dashboard reconnects
                    await close_quietly(websocket, "heartbeat timeout")
                return

            # Rate limit: more than 10 messages in 10 s (pings count too)
            now = time.monotonic()
            recent_messages = [t for t in recent_messages
                               if now - t < RATE_LIMIT_WINDOW_SECONDS]
            recent_messages.append(now)
            if len(recent_messages) > RATE_LIMIT_MESSAGES:
                await close_policy(websocket, "bad message (rate limit)")
                return

            # Size and format checks
            if data is None:
                await close_policy(websocket, "bad message (not text)")
                return
            if len(data) > MAX_MESSAGE_CHARS:
                await close_policy(websocket, "bad message (too large)")
                return
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                logger.info("Dashboard message ignored: not JSON")
                continue

            # Allowed types after auth: ping, leaving, accept, decline, resume, end_call.
            # Everything else is ignored.
            message_type = message.get("type") if isinstance(
                message, dict) else None
            if message_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif message_type == "accept":
                await handle_accept(websocket, connection_id, message)
            elif message_type == "resume":
                await handle_resume(websocket, connection_id, message)
            elif message_type == "end_call":
                await handle_end_call(websocket, connection_id, message)
            elif message_type == "decline":
                await handle_decline(connection_id, message)
            elif message_type == "leaving":
                logger.info("Dashboard leaving")
                # off the list at once (no ~10 s Render delay)
                remove_agent(connection_id)
                # open alerts count as declines (also done again in finally,
                # which is safe: the second call finds nothing)
                await decline_open_alerts(connection_id)
                await close_quietly(websocket, "dashboard leaving")
                return
            else:
                logger.info(
                    f"Dashboard message ignored: type {message_type_for_log(message)}")

    except asyncio.TimeoutError:
        await close_policy(websocket, "auth timeout")
    except json.JSONDecodeError:
        await close_policy(websocket, "bad message (not JSON)")
    except TokenCheckError:
        await close_policy(websocket, "invalid token")
    except WebSocketDisconnect:
        return
    finally:
        if connection_id is not None:
            remove_agent(connection_id)
            # B3: a dashboard that disconnects counts as a decline
            await decline_open_alerts(connection_id)


# TEST ONLY - remove before launch
@router.get("/agent/online-count")
def get_online_count(guard=Depends(secure_route)):
    return {"count": online_count()}
