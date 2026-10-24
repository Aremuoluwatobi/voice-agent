// /agent/js/call-timer.js
// The call timer in the call view. The server says how many seconds have
// passed since Accept (elapsed_seconds). This browser's clock is only used to
// count forward from that number. All text goes in with textContent.

const TIMER_ID = "call-timer";
const EMPTY_TEXT = "00:00";
const UNKNOWN_TEXT = "--:--";
const MAX_SECONDS = 24 * 60 * 60;   // safety cap

let tickId = null;       // the running interval, or null
let baseSeconds = 0;     // seconds the server gave us
let baseTime = 0;        // Date.now() when we got that number

function pad(n) {
    return String(n).padStart(2, "0");
}

function format(total) {
    const s = Math.max(0, Math.min(MAX_SECONDS, Math.floor(total)));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return hours > 0
        ? hours + ":" + pad(minutes) + ":" + pad(seconds)
        : pad(minutes) + ":" + pad(seconds);
}

function setText(text) {
    const el = document.getElementById(TIMER_ID);
    if (el) el.textContent = text;
}

function draw() {
    setText(format(baseSeconds + (Date.now() - baseTime) / 1000));
}

function validSeconds(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// Start, or re-sync, from the server's number. If the number is missing and
// the timer is already running, it keeps running. If it is not running, it
// shows --:-- instead of a wrong time.
export function startTimer(elapsedSeconds) {
    if (validSeconds(elapsedSeconds)) {
        baseSeconds = elapsedSeconds;
        baseTime = Date.now();
    } else if (tickId === null) {
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
    setText(EMPTY_TEXT);
}