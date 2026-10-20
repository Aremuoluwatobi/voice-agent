
import { API_BASE_URL, AGENT_WS_PATH, PING_INTERVAL_MS } from "./config.js";


const WS_URL = API_BASE_URL.replace(/^http/, "ws") + AGENT_WS_PATH;
const POLICY_VIOLATION = 1008;

let socket = null;
let authorised = false;
let pingTimer = null;
let handlers = {};


export function initAgentSocket({ onOnline, onRejected, onDropped, onMessage } = {}) {
    handlers = { onOnline, onRejected, onDropped, onMessage };
    // Tab closing / leaving the page: tell the server at once (decision v24)
    if (typeof window !== "undefined") {
        window.addEventListener("pagehide", () => stopAgentSocket());
    }
}

// Open the socket and log in on it. Call only after GET /agent/dashboard = 200.
export function startAgentSocket(token) {
    if (socket) return; // already open or connecting: never a second socket
    if (!token) return;

    let ws;
    try {
        ws = new WebSocket(WS_URL);
    } catch {
        report("onDropped", null);
        return;
    }
    socket = ws;
    authorised = false;

    ws.onopen = () => {
        if (socket !== ws) return; // an old socket: ignore
        // First message within 5 s: the token (never in the URL, never logged)
        ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
        if (socket !== ws) return;
        let message;
        try {
            message = JSON.parse(event.data);
        } catch {
            return; // not JSON: ignore
        }
        if (!message || typeof message !== "object") return;

        if (message.type === "ok") {
            if (authorised) return; // a second ok: ignore (never two ping timers)
            authorised = true;
            startPing(ws);
            report("onOnline");
        } else if (message.type === "pong") {

        } else if (message.type === "closing") {

            const reason = typeof message.reason === "string" ? message.reason : "unknown";
            forget();
            try { ws.close(1000); } catch { /* already closed */ }
            report("onRejected", reason);
        } else if (authorised) {
            // Server messages about handoffs: incoming, accepted, taken, too_late.
            // main.js decides what each one does.
            report("onMessage", message);
        }
    };

    ws.onclose = (event) => {
        if (socket !== ws) return; // closed on purpose or after closing: stay quiet
        forget();
        if (event.code === POLICY_VIOLATION) {
            report("onRejected", "policy"); // backup, in case a host delivers 1008
        } else {
            report("onDropped", event.code);
        }
    };
}






export function stopAgentSocket() {
    const ws = socket;
    const wasAuthorised = authorised;
    forget(); // from now on, this socket's events are ignored
    if (!ws) return;
    try {
        // Only after ok: before that, the server would read "leaving" as a bad auth message
        if (wasAuthorised && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "leaving" }));
        }
        ws.close(1000);
    } catch {
        // already closed: nothing to do
    }
}

// Send one message to the server. Returns true if it went out.
// Only works after the server said ok. Never throws.
export function sendAgentMessage(message) {
    if (!socket || !authorised || socket.readyState !== WebSocket.OPEN) return false;
    try {
        socket.send(JSON.stringify(message));
        return true;
    } catch {
        return false;
    }
}

function startPing(ws) {
    stopPing();
    pingTimer = setInterval(() => {
        if (socket !== ws || ws.readyState !== WebSocket.OPEN) {
            stopPing();
            return;
        }
        try {
            ws.send(JSON.stringify({ type: "ping" }));
        } catch {
            // the socket is closing; onclose will report it
        }
    }, PING_INTERVAL_MS);
}

function stopPing() {
    if (pingTimer !== null) {
        clearInterval(pingTimer);
        pingTimer = null;
    }
}

// Every way a socket ends goes through here, so the ping timer always stops.
function forget() {
    stopPing();
    socket = null;
    authorised = false;
}

function report(name, info) {
    const callback = handlers[name];
    if (typeof callback !== "function") return;
    try {
        callback(info);
    } catch (error) {
        console.error("agent-socket: " + name + " handler failed", error);
    }
}
