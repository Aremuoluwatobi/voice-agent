// =========================================================
// incoming.js — the incoming-call popup on the waiting view.
// =========================================================

import {
    INCOMING_TIMEOUT_MS,
    SUMMARY_MAX_CHARS,
} from "./config.js";
import { getCurrentView, onViewChange } from "./views.js";
import { startRinging, stopRinging } from "./sound.js";

const FALLBACK_SUMMARY = "Customer needs assistance";
const DECLINED_KEY = "shopdarret_declined_calls";
const DECLINED_MAX = 50;

let currentAlert = null;
let expiryTimerId = null;
let handlers = { onAccept: () => { }, onDecline: () => { } };

// ---------- Small helpers ----------

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

export function showIncomingCall(alert) {

    if (getCurrentView() !== "waiting") return false;
    if (!alert || typeof alert !== "object") return false;

    const handoffId = typeof alert.handoff_id === "string" ? alert.handoff_id.trim() : "";
    if (!handoffId || handoffId.length > 100) return false;

    if (isDeclined(handoffId)) return false;
    if (currentAlert && currentAlert.handoffId === handoffId) return true;

    const summary = cleanText(alert.summary, SUMMARY_MAX_CHARS) || FALLBACK_SUMMARY;

    const popup = document.getElementById("incoming-call");
    const summaryText = document.getElementById("incoming-summary");
    if (!popup || !summaryText) return false;

    summaryText.textContent = summary;

    setButtonsDisabled(false);
    popup.hidden = false;
    currentAlert = { handoffId, summary };

    startRinging(); // silent if the browser is still blocking sound

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
            setButtonsDisabled(true);
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