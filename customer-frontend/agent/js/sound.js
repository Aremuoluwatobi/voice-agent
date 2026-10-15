// =========================================================
// sound.js — the incoming-call ring + the "enable sound" button.
// - The ring is made by the browser (Web Audio API): no sound file,
//   nothing extra on Render or Vercel.
// - Browsers block sound until the agent has clicked/tapped/typed
//   on the page. After a refresh that usually means "blocked", so
//   we show the "Click to enable sound" button in the top bar.
// - If sound stays blocked, nothing breaks: the popup still shows.
// =========================================================

import { RING_INTERVAL_MS, INCOMING_TIMEOUT_MS } from "./config.js";

let audioContext = null;
let ringOutput = null; // the "volume knob" for the current ring; null = not ringing

function getAudioContext() {
    if (audioContext) return audioContext;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null; // very old browser: no sound, no crash
    try {
        audioContext = new AudioContextClass();
    } catch {
        audioContext = null;
    }
    return audioContext;
}

// True when the browser is currently blocking sound
export function isSoundBlocked() {
    const context = getAudioContext();
    if (!context) return false; // no sound support at all → no button to offer
    return context.state !== "running";
}

// Show the top-bar button only while sound is blocked
export function refreshSoundButton() {
    const button = document.getElementById("enable-sound-button");
    if (!button) return;
    button.hidden = !isSoundBlocked();
}

// Must be called from inside a click/tap/key handler (browser rule)
async function unlockSound() {
    const context = getAudioContext();
    if (!context) return false;
    if (context.state === "running") return true;
    try {
        await context.resume();
    } catch {
        return false;
    }
    return context.state === "running";
}

// One short two-tone "ring", starting at startTime (audio clock), into output
function scheduleRing(context, output, startTime) {
    const tones = [
        { frequency: 880, offset: 0 },
        { frequency: 660, offset: 0.25 },
    ];
    for (const tone of tones) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const begin = startTime + tone.offset;
        const end = begin + 0.2;

        oscillator.type = "sine";
        oscillator.frequency.value = tone.frequency;

        // Fade in/out quickly so it doesn't click
        gain.gain.setValueAtTime(0.0001, begin);
        gain.gain.exponentialRampToValueAtTime(0.25, begin + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        oscillator.connect(gain);
        gain.connect(output);
        oscillator.start(begin);
        oscillator.stop(end + 0.05);
    }
}

// Start ringing: one ring every RING_INTERVAL_MS, for at most
// INCOMING_TIMEOUT_MS. All rings are booked on the audio clock in
// one go, so they keep their timing even in a background tab
// (browsers slow down setTimeout there, not the audio clock).
export function startRinging() {
    stopRinging();
    const context = getAudioContext();
    if (!context || context.state !== "running") return false; // blocked: stay silent

    ringOutput = context.createGain();
    ringOutput.connect(context.destination);

    const ringCount = Math.ceil(INCOMING_TIMEOUT_MS / RING_INTERVAL_MS);
    const firstRing = context.currentTime + 0.05;
    for (let i = 0; i < ringCount; i++) {
        scheduleRing(context, ringOutput, firstRing + (i * RING_INTERVAL_MS) / 1000);
    }
    return true;
}

// Stop ringing straight away (Accept, Decline, timeout, logout, view change)
export function stopRinging() {
    if (!ringOutput) return;
    try {
        ringOutput.disconnect(); // cuts every booked ring at once
    } catch {
        // already disconnected
    }
    ringOutput = null;
}

export function isRinging() {
    return ringOutput !== null;
}

// ---------- Called once by main.js ----------
export function initSound() {
    const button = document.getElementById("enable-sound-button");

    // Button click: unlock, play one test ring, hide the button
    if (button) {
        button.addEventListener("click", async () => {
            const unlocked = await unlockSound();
            if (unlocked) {
                const context = getAudioContext();
                const output = context.createGain();
                output.connect(context.destination);
                scheduleRing(context, output, context.currentTime + 0.05);
            }
            refreshSoundButton();
        });
    }

    // ANY click/tap/key on the page also unlocks sound (e.g. Sign in,
    // Accept). Then the button is no longer needed.
    const unlockOnGesture = async () => {
        if (!isSoundBlocked()) return;
        await unlockSound();
        refreshSoundButton();
    };
    document.addEventListener("pointerdown", unlockOnGesture);
    document.addEventListener("keydown", unlockOnGesture);
}
