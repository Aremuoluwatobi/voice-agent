// /agent/js/call-handoff.js

const EMPTY = "—";
const NO_RESOLUTION = "No suggestion yet";

const FIELDS = [
    { key: "product", id: "call-product", max: 120, fallback: EMPTY },
    { key: "complaint", id: "call-complaint", max: 300, fallback: EMPTY },
    { key: "agent_told", id: "call-told", max: 300, fallback: EMPTY },
    { key: "suggested_resolution", id: "call-resolution", max: 300, fallback: NO_RESOLUTION },
];
const ORDER_ID_ELEMENT = "call-order-id";
const ALL_IDS = [ORDER_ID_ELEMENT, ...FIELDS.map((f) => f.id)];

// collapse spaces/new lines, trim, cut long text with "…"
function clean(value, max) {
    if (typeof value !== "string") return "";
    const text = value.replace(/\s+/g, " ").trim();
    return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

// same rule as the popup: leading # removed, cut at 40, shown as "#<id>"
function cleanOrderId(value) {
    if (typeof value !== "string") return "";
    const id = value.replace(/\s+/g, " ").trim().replace(/^#+/, "").trim().slice(0, 40);
    return id ? "#" + id : "";
}

function setText(id, text, fallback) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.textContent = text || fallback;
    return true;
}

// Call once (from main.js) after the page loads.
export function initHandoff() {
    const allFound = ALL_IDS.every((id) => document.getElementById(id));
    if (!allFound) return false;
    clearHandoff();
    return true;
}

// Fill the card. Missing or empty fields show "—" (or "No suggestion yet").
export function showHandoff(card) {
    if (!card || typeof card !== "object") return false;
    let ok = setText(ORDER_ID_ELEMENT, cleanOrderId(card.order_id), EMPTY);
    for (const f of FIELDS) {
        ok = setText(f.id, clean(card[f.key], f.max), f.fallback) && ok;
    }
    return ok;
}

// Back to the empty state (start of a new call / End call).
export function clearHandoff() {
    setText(ORDER_ID_ELEMENT, "", EMPTY);
    for (const f of FIELDS) setText(f.id, "", f.fallback);
}
