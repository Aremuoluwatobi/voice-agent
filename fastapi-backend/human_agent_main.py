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
    POLICY_VIOLATION
)
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from route_gaurd import secure_route
from logger_s import get_logger
from route_gaurd import verify_token, TokenCheckError
import secrets
import jwt
import asyncio
import json
import time


router = APIRouter()

logger = get_logger(__name__)


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
    await websocket.close(code=POLICY_VIOLATION)
    logger.warning(f"Dashboard socket closed sent: {reason}")


@router.websocket("/agent/ws")
async def agent_websocket(websocket: WebSocket):
    # 1. Origin check, before accepting
    if websocket.headers.get("origin") != FRONTEND_ORIGIN:
        logger.warning("Dashboard socket refused: bad origin")
        await websocket.close(code=POLICY_VIOLATION)
        return

    # 2. Accept
    await websocket.accept()

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

        # 7. Keep the socket open until the token expires
        while True:
            seconds_left = expires_at - time.time()
            if seconds_left <= 0:
                await close_policy(websocket, "expired")
                return
            try:
                await receive_text_message(websocket, seconds_left)
                # Messages are ignored for now; ping and message rules come in piece 4
            except asyncio.TimeoutError:
                await close_policy(websocket, "expired")
                return

    except asyncio.TimeoutError:
        await close_policy(websocket, "auth timeout")
    except json.JSONDecodeError:
        await close_policy(websocket, "bad message (not JSON)")
    except TokenCheckError:
        await close_policy(websocket, "invalid token")
    except WebSocketDisconnect:
        return
