// /agent/js/call-handoff.js


const SUMMARY_ID = "call-summary";
const RESOLUTION_ID = "call-resolution";
const RAGAS_PILL_ID = "call-ragas-pill";
const RAGAS_LABEL_ID = "call-ragas-label";
const RAGAS_SCORE_ID = "call-ragas-score";
const RAGAS_REASON_ID = "call-ragas-reason";
const NO_SUMMARY = "No summary yet";
const NO_RESOLUTION = "No suggestion yet";
const NOT_CHECKED = "Not checked";
const REASON_PREFIX = "AI said: ";
const MAX_SUMMARY = 2000;      // safety cap only; the box scrolls
const MAX_RESOLUTION = 300;
const MAX_REASON = 260;
const COLOURS = ["green", "orange", "red", "grey"];

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

// The RAGAS box. The name, colour, words and score are always shown.
// Text is shown only for orange and red: the AI's exact words that caused it.
// No result, or an unknown colour, shows grey "Not checked".
function showRagas(ragas) {
    const pill = document.getElementById(RAGAS_PILL_ID);
    const label = document.getElementById(RAGAS_LABEL_ID);
    const score = document.getElementById(RAGAS_SCORE_ID);
    const reason = document.getElementById(RAGAS_REASON_ID);
    if (!pill || !label || !score || !reason) return false;

    const data = ragas && typeof ragas === "object" ? ragas : {};
    const known = COLOURS.includes(data.colour);
    const colour = known ? data.colour : "grey";
    const words = known ? (clean(data.label, 40) || NOT_CHECKED) : NOT_CHECKED;
    const hasScore = known && typeof data.score === "number" &&
        Number.isFinite(data.score) && data.score >= 0 && data.score <= 1;

    pill.dataset.colour = colour;
    label.textContent = words;
    score.textContent = hasScore ? data.score.toFixed(2) : "";

    let text = "";
    if (colour === "orange" || colour === "red") {
        const line = clean(data.line, MAX_REASON);
        text = line ? REASON_PREFIX + line : clean(data.note, MAX_REASON);
        const pending = Number.isInteger(data.pending) ? data.pending : 0;
        if (pending > 0) {
            text = (text + " " + pending + " more still being checked.").trim();
        }
    }
    reason.dataset.colour = colour;
    reason.textContent = text;
    reason.hidden = !text;
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
    showRagas(card.ragas);
    return summaryOk && resolutionOk;
}

// Back to the empty state (start of a new call / End call).
export function clearHandoff() {
    setText(SUMMARY_ID, "", NO_SUMMARY);
    setText(RESOLUTION_ID, "", NO_RESOLUTION);
    showRagas(null);
}