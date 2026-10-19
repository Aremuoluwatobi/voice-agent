// =========================================================
// api.js — the ONE place every protected request goes through.
// =========================================================

import { API_BASE_URL, SLOW_NOTICE_MS, REQUEST_TIMEOUT_MS } from "./config.js";
import { getToken, clearToken, isTokenExpired } from "./auth.js";
import { showView, getCurrentView, setAgentStatus } from "./views.js";
import { setLoginStatus } from "./login.js";
import { stopAgentSocket } from "./agent-socket.js";

const SESSION_ENDED_MESSAGE = "Your session has ended. Please sign in again.";
const CALL_NOTICE_TEXT = "Session expired. Log in again after this call.";

// True when the session ended while the agent was on a call (decision v24/v25).
// Step 4's End call reads it: set -> clear the token and go to login.
let sessionEnded = false;


export async function apiFetch(path, { method = "GET", body, onSlow } = {}) {
    const token = getToken();
    if (!token) {
        handleUnauthorized();
        return { ok: false, status: 0, reason: "no-token" };
    }

    const headers = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const slowId = onSlow ? setTimeout(onSlow, SLOW_NOTICE_MS) : null;

    try {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });

        if (response.status === 401) {
            handleUnauthorized();
            return { ok: false, status: 401, reason: "unauthorized" };
        }

        if (!response.ok) {
            return { ok: false, status: response.status, reason: "error" };
        }

        let data = null;
        try {
            data = await response.json();
        } catch {
            data = null;
        }
        return { ok: true, status: response.status, data };
    } catch (error) {
        const reason = error.name === "AbortError" ? "timeout" : "offline";
        return { ok: false, status: 0, reason };
    } finally {
        clearTimeout(timeoutId);
        if (slowId) clearTimeout(slowId);
    }
}

// Any 401 anywhere ends up here.
// The server gives the same 401 for every token failure, so the token's own
// expiry time decides: expired = normal end of session; anything else
// (tampered, missing, rejected) = treated as unsafe.
export function handleUnauthorized() {
    const token = getToken();
    const expired = Boolean(token) && isTokenExpired(token);
    endSession(SESSION_ENDED_MESSAGE, expired ? "expired" : "unauthorized");
}

// The ONE place a session ends (any 401, socket rejected, token expired).
// Only a NORMAL expiry on the call view keeps the call (decision v24):
//   notice + flag, socket closed, login after End call.
// Every other reason, or any other view -> clear the token and go to login
// (the login clean-up empties the call view).
export function endSession(loginMessage = SESSION_ENDED_MESSAGE, reason = "unauthorized") {
    if (reason === "expired" && getCurrentView() === "call") {
        sessionEnded = true;
        stopAgentSocket(); // no new call alerts (safe if already closed)
        setAgentStatus("Session expired", "offline");
        const notice = document.getElementById("call-session-notice");
        if (notice) {
            notice.textContent = CALL_NOTICE_TEXT;
            notice.hidden = false;
        }
        return;
    }
    clearToken();
    showView("login");
    setLoginStatus(loginMessage, "info");
}

export function isSessionEnded() {
    return sessionEnded;
}

// Called when the view becomes login: reset the flag and hide the notice.
export function clearSessionEnded() {
    sessionEnded = false;
    const notice = document.getElementById("call-session-notice");
    if (notice) {
        notice.textContent = "";
        notice.hidden = true;
    }
}
