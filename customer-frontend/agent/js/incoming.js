// =========================================================
// incoming.js — the incoming-call popup on the waiting view.
// - No fake data: the popup stays hidden until a REAL alert
//   arrives (step 3b/3c calls showIncomingCall(alert)).
// - Alert shape (agreed in step 3):
//     { handoff_id: "abc123",          required, not shown
//       summary:    "Caller says...",  AI summary, optional
//       order_id:   "48213-NG" }       only if confirmed, optional
// - Decline = hides it in THIS browser only (others still see it).
// - All text goes in with textContent, never innerHTML.
// =========================================================

import {
    INCOMING_TIMEOUT_MS,
    SUMMARY_MAX_CHARS,
    ORDER_ID_MAX_CHARS,
} from "./config.js";
import { getCurrentView, onViewChange } from "./views.js";
import { startRinging, stopRinging } from "./sound.js";

const FALLBACK_SUMMARY = "Customer needs assistance";
const DECLINED_KEY = "shopdarret_declined_calls";
const DECLINED_MAX = 50; // keep only the latest 50 declined IDs

let currentAlert = null;   // the alert on screen, or null
let expiryTimerId = null;
let handlers = { onAccept: () => { }, onDecline: () => { } };

// ---------- Small helpers ----------

// Collapse spaces/new lines, trim, and cut long text with "…"
function cleanText(value, maxChars) {
    if (typeof value !== "string") return "";
    const text = value.replace(/\s+/g, " ").trim();
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars - 1).trimEnd() + "…";
}

function readDeclined() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(DECLINED_KEY) || "[]");
        return Array.isArray(saved) ? saved : [];
    } catch {
        return [];
    }
}

function rememberDeclined(handoffId) {
    const declined = readDeclined().filter((id) => id !== handoffId);
    declined.push(handoffId);
    try {
        sessionStorage.setItem(DECLINED_KEY, JSON.stringify(declined.slice(-DECLINED_MAX)));
    } catch {
        // storage blocked: Decline still hides it, it just won't be remembered
    }
}

function isDeclined(handoffId) {
    return readDeclined().includes(handoffId);
}

export function clearDeclinedCalls() {
    try {
        sessionStorage.removeItem(DECLINED_KEY);
    } catch {
        // nothing to do
    }
}

// ---------- Show / hide ----------

// Called by the real alert (step 3b/3c). Returns true if shown.
export function showIncomingCall(alert) {
    // Only on the waiting view. null = page not ready → do nothing.
    if (getCurrentView() !== "waiting") return false;
    if (!alert || typeof alert !== "object") return false;

    const handoffId = typeof alert.handoff_id === "string" ? alert.handoff_id.trim() : "";
    if (!handoffId || handoffId.length > 100) return false;

    if (isDeclined(handoffId)) return false;                               // declined here before
    if (currentAlert && currentAlert.handoffId === handoffId) return true; // already showing

    const summary = cleanText(alert.summary, SUMMARY_MAX_CHARS) || FALLBACK_SUMMARY;
    const orderId = cleanText(alert.order_id, ORDER_ID_MAX_CHARS).replace(/^#+/, "");

    const popup = document.getElementById("incoming-call");
    const summaryText = document.getElementById("incoming-summary");
    const orderText = document.getElementById("incoming-order");
    if (!popup || !summaryText || !orderText) return false;

    summaryText.textContent = summary;
    if (orderId) {
        orderText.textContent = `Order #${orderId}`;
        orderText.hidden = false;
    } else {
        orderText.textContent = "";
        orderText.hidden = true; // no confirmed order ID → no order line
    }

    setButtonsDisabled(false);
    popup.hidden = false;
    currentAlert = { handoffId, summary, orderId };

    startRinging(); // silent if the browser is still blocking sound

    // Safety net: hide by itself after 30s (my-agent gives up at 30s too)
    clearTimeout(expiryTimerId);
    expiryTimerId = setTimeout(() => hideIncomingCall(), INCOMING_TIMEOUT_MS);

    return true;
}

// Hide the popup and stop the ring. Safe to call any time.
export function hideIncomingCall() {
    clearTimeout(expiryTimerId);
    expiryTimerId = null;
    stopRinging();
    currentAlert = null;

    const popup = document.getElementById("incoming-call");
    if (popup) popup.hidden = true;
}

// The alert on screen (or null). Step 3c uses this.
export function getCurrentAlert() {
    return currentAlert;
}

function setButtonsDisabled(disabled) {
    for (const id of ["incoming-accept", "incoming-decline"]) {
        const button = document.getElementById(id);
        if (button) button.disabled = disabled;
    }
}

// ---------- Called once by main.js ----------
// onAccept(alert) / onDecline(alert): step 3c fills these in.
export function initIncoming({ onAccept, onDecline } = {}) {
    if (onAccept) handlers.onAccept = onAccept;
    if (onDecline) handlers.onDecline = onDecline;

    const acceptButton = document.getElementById("incoming-accept");
    const declineButton = document.getElementById("incoming-decline");

    if (acceptButton) {
        acceptButton.addEventListener("click", () => {
            if (!currentAlert) return;
            const alert = currentAlert;
            stopRinging();
            setButtonsDisabled(true); // one click only; step 3c decides what's next
            handlers.onAccept(alert);
        });
    }

    if (declineButton) {
        declineButton.addEventListener("click", () => {
            if (!currentAlert) return;
            const alert = currentAlert;
            rememberDeclined(alert.handoffId);
            hideIncomingCall();
            handlers.onDecline(alert);
        });
    }

    // Leaving the waiting view (logout, 401, call view) always hides it
    onViewChange((name) => {
        if (name !== "waiting") hideIncomingCall();
    });
}
