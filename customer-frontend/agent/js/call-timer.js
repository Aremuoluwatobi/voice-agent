const TIMER_SELECTOR = ".call-timer";
const START_TEXT = "00:00";

let intervalId = null;
let startedAt = 0;

function pad(n) {
    return String(n).padStart(2, "0");
}

export function formatElapsed(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return hours > 0
        ? `${hours}:${pad(minutes)}:${pad(seconds)}`
        : `${pad(minutes)}:${pad(seconds)}`;
}

function show(text) {
    for (const el of document.querySelectorAll(TIMER_SELECTOR)) {
        el.textContent = text;
    }
}

function tick() {
    show(formatElapsed((Date.now() - startedAt) / 1000));
}

// startTimeMs (optional): a saved start time in milliseconds.
// Returns the start time used, so main.js can save it for refreshes.
export function startCallTimer(startTimeMs) {
    stopCallTimer();                        // never run two timers at once
    startedAt = Number.isFinite(startTimeMs) ? startTimeMs : Date.now();
    tick();
    intervalId = setInterval(tick, 1000);
    return startedAt;
}

// Stop and go back to 00:00 (End call, Log out, back to login).
export function stopCallTimer() {
    if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
    }
    show(START_TEXT);
}