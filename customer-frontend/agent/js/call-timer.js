// /agent/js/call-timer.js
const TIMER_ID = "call-timer";
const EMPTY_TEXT = "00:00";
const UNKNOWN_TEXT = "--:--";
const MAX_SECONDS = 24 * 60 * 60;   // anything above this is treated as wrong

let tickId = null;     // the running interval, or null
let startedAt = null;  // browser time (ms) when the call started

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

function draw() {
    if (startedAt === null) return;
    const seconds = (Date.now() - startedAt) / 1000;
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_SECONDS) {
        setText(UNKNOWN_TEXT);   // a wrong time is worse than no time
        return;
    }
    setText(formatClock(seconds));
}

function validSeconds(value) {
    return typeof value === "number" && Number.isFinite(value) &&
        value >= 0 && value <= MAX_SECONDS;
}

// Start, or re-sync, from the server's number. If the number is bad and the
// timer is already running, it keeps running. If it is not running, it shows
// --:-- instead of a wrong time.
export function startTimer(elapsedSeconds) {
    if (validSeconds(elapsedSeconds)) {
        startedAt = Date.now() - elapsedSeconds * 1000;
    } else if (startedAt === null) {
        setText(UNKNOWN_TEXT);
        return;
    }
    draw();
    if (tickId === null) tickId = setInterval(draw, 500);
}

// End of the call: stop counting and go back to 00:00.
export function stopTimer() {
    if (tickId !== null) {
        clearInterval(tickId);
        tickId = null;
    }
    startedAt = null;
    setText(EMPTY_TEXT);
}