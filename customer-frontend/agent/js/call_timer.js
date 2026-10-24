// /agent/js/call-timer.js
// The call timer in the call view. The server says how many seconds have
// passed since Accept (elapsed_seconds). This browser's clock only counts
// forward from that number. When the call ends, the timer freezes and the
// final time is kept for this tab, so a refresh shows the same time instead
// of counting again. All text goes in with textContent.

const TIMER_ID = "call-timer";
const EMPTY_TEXT = "00:00";
const UNKNOWN_TEXT = "--:--";
const MAX_SECONDS = 24 * 60 * 60;   // anything above this is treated as wrong
const STORE_KEY = "call-timer-ended";
const START_KEY = "call-timer-start";

let tickId = null;     // the running interval, or null
let startedAt = null;  // browser time (ms) when the call started
let callId = "";       // the call the timer is showing
let frozen = null;     // { id, seconds } once the call has ended

function pad(n) {
    return String(n).padStart(2, "0");
}

// 00:01 ... 59:59, then 1:00:00 (never 61:00)
function formatClock(total) {
    const s = Math.floor(total);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    if (hours > 0) return hours + ":" + pad(minutes) + ":" + pad(seconds);
    return pad(minutes) + ":" + pad(seconds);
}

function setText(text) {
    const el = document.getElementById(TIMER_ID);
    if (el) el.textContent = text;
}

function validSeconds(value) {
    return typeof value === "number" && Number.isFinite(value) &&
        value >= 0 && value <= MAX_SECONDS;
}

function stopTick() {
    if (tickId !== null) {
        clearInterval(tickId);
        tickId = null;
    }
}

function draw() {
    if (startedAt === null) return;
    const seconds = (Date.now() - startedAt) / 1000;
    if (!validSeconds(seconds)) {
        setText(UNKNOWN_TEXT);   // a wrong time is worse than no time
        return;
    }
    setText(formatClock(seconds));
}

function remember(item) {
    try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(item));
    } catch (error) {
        // storage blocked: the copy in memory still works until a refresh
    }
}

// The final time of a call that already ended, or null.
function recall(id) {
    if (frozen && frozen.id === id) return frozen.seconds;
    try {
        const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null");
        if (saved && saved.id === id && validSeconds(saved.seconds)) {
            frozen = { id: saved.id, seconds: saved.seconds };
            return saved.seconds;
        }
    } catch (error) {
        // unreadable: treat the call as not ended
    }
    return null;
}

function saveStart(id, startMs) {
    try {
        localStorage.setItem(START_KEY, JSON.stringify({ id: id, startMs: startMs }));
    } catch (error) {
        // storage blocked: the server's number is still used
    }
}

// The start time this browser saved for this call, or null.
function readStart(id) {
    try {
        const saved = JSON.parse(localStorage.getItem(START_KEY) || "null");
        if (saved && saved.id === id && typeof saved.startMs === "number" &&
            Number.isFinite(saved.startMs) && saved.startMs <= Date.now() &&
            Date.now() - saved.startMs <= MAX_SECONDS * 1000) {
            return saved.startMs;
        }
    } catch (error) {
        // unreadable: ignore it
    }
    return null;
}

export function startTimer(elapsedSeconds, id) {
    callId = typeof id === "string" ? id : "";
    const ended = callId ? recall(callId) : null;
    if (ended !== null) {
        stopTick();
        startedAt = null;
        setText(formatClock(ended));
        return;
    }

    // Two estimates of when the call started: the server's number, and the
    // start time this browser saved earlier. The earlier one is the longer
    // call, so a missing or reset server number cannot make the timer restart.
    const estimates = [];
    if (validSeconds(elapsedSeconds)) {
        estimates.push(Date.now() - elapsedSeconds * 1000);
    }
    const saved = callId ? readStart(callId) : null;
    if (saved !== null) estimates.push(saved);

    if (estimates.length > 0) {
        startedAt = Math.min(...estimates);
    } else if (startedAt === null) {
        setText(UNKNOWN_TEXT);
        return;
    }
    if (callId) saveStart(callId, startedAt);
    draw();
    if (tickId === null) tickId = setInterval(draw, 500);
}
// The call ended but End call was not pressed yet: stop counting, keep the
// final time on screen, and remember it for a refresh.
export function freezeTimer() {
    if (startedAt === null) return;
    const seconds = (Date.now() - startedAt) / 1000;
    stopTick();
    startedAt = null;
    if (!validSeconds(seconds)) {
        setText(UNKNOWN_TEXT);
        return;
    }
    const whole = Math.floor(seconds);
    setText(formatClock(whole));
    if (callId) {
        frozen = { id: callId, seconds: whole };
        remember(frozen);
    }
}

export function stopTimer() {
    stopTick();
    startedAt = null;
    frozen = null;
    try {
        sessionStorage.removeItem(STORE_KEY);
    } catch (error) {
        // nothing to clear
    }
    try {
        localStorage.removeItem(START_KEY);
    } catch (error) {
        // nothing to clear
    }
    setText(EMPTY_TEXT);
}