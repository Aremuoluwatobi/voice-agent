import uuid

from fastapi import WebSocket

from logger_s import get_logger

logger = get_logger(__name__)

online_agents: dict[str, WebSocket] = {}


open_alerts: dict[str, set[str]] = {}


def add_agent(websocket: WebSocket) -> str:
    """Add an authenticated dashboard and return its new connection ID."""
    connection_id = str(uuid.uuid4())
    online_agents[connection_id] = websocket
    logger.info(f"Dashboard online. Online count: {len(online_agents)}")
    return connection_id


def remove_agent(connection_id: str) -> None:
    """Remove a dashboard. Safe to call twice or with an unknown ID.

    Open alerts are NOT cleared here, because the caller still has to
    decline them first (take_open_alerts does the clearing).
    """
    if online_agents.pop(connection_id, None) is not None:
        logger.info(f"Dashboard offline. Online count: {len(online_agents)}")


def online_count() -> int:
    return len(online_agents)


# ---------- Open alerts (B3) ----------

def add_open_alert(connection_id: str, handoff_id: str) -> None:
    """Remember that this dashboard received this alert."""
    if connection_id not in online_agents:
        return
    open_alerts.setdefault(connection_id, set()).add(handoff_id)


def close_open_alert(connection_id: str, handoff_id: str) -> None:
    """This dashboard answered (or lost) this alert. Safe if it is not there."""
    alerts = open_alerts.get(connection_id)
    if alerts is None:
        return
    alerts.discard(handoff_id)
    if not alerts:
        open_alerts.pop(connection_id, None)


def close_alert_everywhere(handoff_id: str) -> list[str]:
    """The alert is decided. Remove it from every dashboard and return the
    connection IDs that still had it open (the winner is among them)."""
    holders = []
    for connection_id in list(open_alerts):
        if handoff_id in open_alerts[connection_id]:
            holders.append(connection_id)
            close_open_alert(connection_id, handoff_id)
    return holders


def take_open_alerts(connection_id: str) -> list[str]:
    """Return and clear every alert this dashboard still had open.
    A second call returns an empty list, so it is safe to call twice."""
    return list(open_alerts.pop(connection_id, set()))
