// /agent/js/call-handoff.js
// Customer handoff summary + suggested resolution in the active call view.
// The HTML holds no customer data: both values start as an empty-state text
// and are only filled by showHandoff(card). All text goes in with textContent.
//
// card = {
//   summary:              "...",  // from the handoff card the backend saves
//   suggested_resolution: "...",  // optional
// }
// Scores (RAGAS / order match) are NOT handled here (Phases 5-6).

const SUMMARY_ID = "call-summary";
const RESOLUTION_ID = "call-resolution";
const NO_SUMMARY = "No summary yet";
const NO_RESOLUTION = "No suggestion yet";
const MAX_SUMMARY = 2000;      // safety cap only; the box scrolls
const MAX_RESOLUTION = 300;

// collapse spaces/new lines, trim, cut very long text with "…"
function clean(value, max) {
    if (typeof value !== "string") return "";
    const text = value.replace(/\s+/g, " ").trim();
    return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

function setText(id, text, fallback) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.textContent = text || fallback;
    el.scrollTop = 0;            // a new card always opens at the top
    return true;
}

// Call once (from main.js) after the page loads.
export function initHandoff() {
    if (!document.getElementById(SUMMARY_ID)) return false;
    if (!document.getElementById(RESOLUTION_ID)) return false;
    clearHandoff();
    return true;
}

// Fill the card. Missing or empty values show the empty-state text.
export function showHandoff(card) {
    if (!card || typeof card !== "object") return false;
    const summaryOk = setText(SUMMARY_ID, clean(card.summary, MAX_SUMMARY), NO_SUMMARY);
    const resolutionOk = setText(
        RESOLUTION_ID,
        clean(card.suggested_resolution, MAX_RESOLUTION),
        NO_RESOLUTION
    );
    return summaryOk && resolutionOk;
}

// Back to the empty state (start of a new call / End call).
export function clearHandoff() {
    setText(SUMMARY_ID, "", NO_SUMMARY);
    setText(RESOLUTION_ID, "", NO_RESOLUTION);
}