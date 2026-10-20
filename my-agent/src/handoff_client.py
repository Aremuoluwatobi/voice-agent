"""my-agent side of the human handoff (step B5).

1. request_handoff(): POST /agent/handoff on the Render backend.
2. wait_for_decision(): check the handoff status key in Redis about every
   second, for up to HANDOFF_TIMEOUT_SECONDS, until a dashboard accepts,
   every dashboard declines, or the key expires.

The summary is never logged (it can hold customer details). The secret is
never logged either.
"""

import asyncio
import json
import logging
import time
import urllib.error
import urllib.request
from typing import Optional

from .agent_config import (
    redis,
    BACKEND_URL,
    HANDOFF_SECRET,
    HANDOFF_TIMEOUT_SECONDS,
    HANDOFF_POLL_SECONDS,
    HANDOFF_REQUEST_TIMEOUT_SECONDS,
)

logger = logging.getLogger("agent")

# Results handed back to agent.py
RESULT_WAITING = "waiting"      # backend alerted dashboards, now wait for a decision
RESULT_ACCEPTED = "accepted"    # a human accepted
RESULT_DECLINED = "declined"    # every alerted dashboard declined
RESULT_NO_AGENTS = "no_agents"  # nobody online
RESULT_TIMEOUT = "timeout"      # nobody answered in time (status key gone)
RESULT_ERROR = "error"          # something failed on our side


def _post_blocking(url: str, payload: dict) -> tuple[int, Optional[dict]]:
    """Plain blocking POST. Run it in a thread so the call audio is not held up."""
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Handoff-Secret": HANDOFF_SECRET,
        },
    )
    try:
        with urllib.request.urlopen(
            request, timeout=HANDOFF_REQUEST_TIMEOUT_SECONDS
        ) as response:
            body = json.loads(response.read().decode("utf-8"))
            return response.status, body
    except urllib.error.HTTPError as error:
        return error.code, None


async def request_handoff(room_name: str, summary: str) -> tuple[str, Optional[str]]:
    """Ask the backend to alert the human dashboards.

    Returns (result, handoff_id). handoff_id is only set when result is
    RESULT_WAITING.
    """
    if not BACKEND_URL or not HANDOFF_SECRET:
        logger.error(
            "Handoff not configured: BACKEND_URL or HANDOFF_SECRET missing")
        return RESULT_ERROR, None

    payload = {"room_name": room_name, "summary": summary}
    try:
        status_code, body = await asyncio.to_thread(
            _post_blocking, BACKEND_URL + "/agent/handoff", payload
        )
    except Exception as error:
        logger.error(f"Handoff request failed: {type(error).__name__}")
        return RESULT_ERROR, None

    if status_code != 200 or not isinstance(body, dict):
        logger.error(f"Handoff request refused: HTTP {status_code}")
        return RESULT_ERROR, None

    status = body.get("status")
    handoff_id = body.get("handoff_id")

    if status == "waiting" and isinstance(handoff_id, str) and handoff_id:
        logger.info(
            f"Handoff {handoff_id[:8]} created, alerted {body.get('agents_alerted')} dashboards")
        return RESULT_WAITING, handoff_id
    if status == "no_agents":
        logger.info("Handoff: no agents online")
        return RESULT_NO_AGENTS, None

    logger.error(f"Handoff reply not understood: status {status}")
    return RESULT_ERROR, None


async def wait_for_decision(handoff_id: str) -> str:
    """Check Redis until the handoff is decided. Returns a RESULT_ value.

    Status key (must match the backend exactly): handoff:{id}:status
      "waiting"  -> keep waiting
      "accepted" -> a human accepted
      "declined" -> every alerted dashboard declined
      key gone   -> the 30 s ran out
    """
    status_key = "handoff:{" + handoff_id + "}:status"
    deadline = time.monotonic() + HANDOFF_TIMEOUT_SECONDS
    failures = 0

    while True:
        try:
            value = await redis.get(status_key)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            failures += 1
            logger.warning(
                f"Handoff status check failed ({failures}): {type(error).__name__}")
            if failures >= 3:
                return RESULT_ERROR
        else:
            failures = 0
            if isinstance(value, bytes):
                value = value.decode("utf-8", errors="ignore")
            if value == "accepted":
                logger.info(f"Handoff {handoff_id[:8]} accepted")
                return RESULT_ACCEPTED
            if value == "declined":
                logger.info(f"Handoff {handoff_id[:8]} declined by everyone")
                return RESULT_DECLINED
            if value is None:
                logger.info(
                    f"Handoff {handoff_id[:8]} timed out (status key gone)")
                return RESULT_TIMEOUT
            # any other value (normally "waiting"): keep waiting

        if time.monotonic() >= deadline:
            logger.info(f"Handoff {handoff_id[:8]} timed out (our wait ended)")
            return RESULT_TIMEOUT
        await asyncio.sleep(HANDOFF_POLL_SECONDS)
