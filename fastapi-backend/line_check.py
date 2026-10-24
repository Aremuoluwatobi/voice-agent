# line_check.py
"""The route my-agent calls after each AI line is saved. It answers at once and
judges in the background, so the call is never slowed."""

import secrets
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel, Field

from config import HANDOFF_SECRET
from claim_check import run_line_check
from logger_s import get_logger

router = APIRouter()
logger = get_logger(__name__)


def secret_ok(provided: Optional[str]) -> bool:
    return secrets.compare_digest(
        (provided or "").encode("utf-8"), HANDOFF_SECRET.encode("utf-8"))


class LineCheckRequest(BaseModel):
    room_name: str = Field(min_length=1, max_length=100)
    seq: int = Field(ge=0)


@router.post("/agent/check-line")
async def check_line(
    body: LineCheckRequest,
    background_tasks: BackgroundTasks,
    x_handoff_secret: Optional[str] = Header(default=None),
):
    if not secret_ok(x_handoff_secret):
        logger.warning("Line check refused: bad secret")
        raise HTTPException(status_code=401, detail="Unauthorized")
    background_tasks.add_task(run_line_check, body.room_name.strip(), body.seq)
    return {"queued": True}
