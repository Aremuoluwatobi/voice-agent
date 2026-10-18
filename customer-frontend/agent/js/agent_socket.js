// Dashboard WebSocket (step 3b, piece 5).
// This file only talks to the server and reports what happened.
// It never changes the view or the top bar: main.js decides what each event means.
import { API_BASE_URL, AGENT_WS_PATH, PING_INTERVAL_MS } from "./config.js";

// https://... -> wss://...  (http://... -> ws://... for local tests)
const WS_URL = API_BASE_URL.replace(/^http/, "ws") + AGENT_WS_PATH;
const POLICY_VIOLATION = 1008;

let socket = null;      // the current WebSocket (open or connecting), or null
let authorised = false; // true once the server has sent {"type":"ok"}
let pingTimer = null;   // the 30 s heartbeat timer, or null
let handlers = {};      // callbacks given by main.js

// Call once from main.js, next to the other init calls.
//   onOnline()          -> the server accepted the token
//   onRejected(reason)  -> closing message or 1008: login, never reconnect (step 3)
//   onDropped(code)     -> any other drop: check GET /agent/dashboard, then reconnect (step 4)
export function initAgentSocket({ onOnline, onRejected, onDropped } = {}) {
    handlers = { onOnline, onRejected, onDropped };
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
            // Heartbeat answer: nothing to do (the ping itself keeps us on the list)
        } else if (message.type === "closing") {
            // Rule v23: close the socket ourselves at once (Render drops the
            // server's close, which would otherwise arrive ~20 s later as 1006).
            const reason = typeof message.reason === "string" ? message.reason : "unknown";
            forget();
            try { ws.close(1000); } catch { /* already closed */ }
            report("onRejected", reason);
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

// Planned close (Log out, page closing, going to login).
// Sends "leaving" first so the server removes the dashboard at once (decision v24).
// No event is reported to main.js.
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

// Heartbeat: one {"type":"ping"} every 30 s, only after ok (decision v24).
// The server drops a dashboard after 75 s of silence, so two pings fit in that window.
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
