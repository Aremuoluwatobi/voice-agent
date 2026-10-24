import json
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from livekit import api

from config import (
    LIVEKIT_API_SECRET,
    LIVEKIT_API_KEY,
    LIVEKIT_URL,
    FRONTEND_ORIGIN,
    CALL_LOCK_KEY,
    LOCK_TIMEOUT_SECONDS,
)
from config import redis
from human_agent_main import router
from handoff import router as handoff_router
from helper_agent import router as helper_router
from line_check import router as check_line
from logger_s import get_logger


logger = get_logger(__name__)

app = FastAPI()
app.include_router(router)
app.include_router(handoff_router)
app.include_router(helper_router)
app.include_router(check_line)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.get("/health")
def check_health():
    return {"status": "working fine"}


@app.post("/api/token")
async def create_token():

    user_id = f"customer-{uuid.uuid4().hex[:8]}"

    # lock room if empty (the lock's value is this customer's user_id)
    locked = await redis.set(CALL_LOCK_KEY, user_id, ex=LOCK_TIMEOUT_SECONDS, nx=True)
    if not locked:
        raise HTTPException(
            status_code=409, detail="Line busy, please Try again later")

    try:
        room_name = f"call-{uuid.uuid4().hex[:8]}"

        token = (
            api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
            .with_identity(user_id)
            .with_grants(api.VideoGrants(room_join=True, room=room_name))
            .with_room_config(
                api.RoomConfiguration(
                    departure_timeout=20,
                    agents=[
                        api.RoomAgentDispatch(
                            agent_name="my-agent",
                            # my-agent reads this to know which lock is its own
                            metadata=json.dumps({"user_id": user_id}),
                        )
                    ],
                )
            )
            .to_jwt()
        )
        return {
            "token": token,
            "room_name": room_name,
            "LIVEKIT_URL": LIVEKIT_URL
        }
    except Exception as e:
        logger.error(f"Failed to generate LiveKit token: {e}")
        await redis.delete(CALL_LOCK_KEY)
        raise HTTPException(status_code=400, detail="Failed to start call")
