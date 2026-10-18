import uuid

from fastapi import WebSocket

from logger_s import get_logger

logger = get_logger(__name__)

online_agents: dict[str, WebSocket] = {}


def add_agent(websocket: WebSocket) -> str:
    """Add an authenticated dashboard and return its new connection ID."""
    connection_id = str(uuid.uuid4())
    online_agents[connection_id] = websocket
    logger.info(f"Dashboard online. Online count: {len(online_agents)}")
    return connection_id


def remove_agent(connection_id: str) -> None:
    """Remove a dashboard. Safe to call twice or with an unknown ID."""
    if online_agents.pop(connection_id, None) is not None:
        logger.info(f"Dashboard offline. Online count: {len(online_agents)}")


def online_count() -> int:
    return len(online_agents)
