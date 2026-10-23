// =========================================================
// call-helper.js: the AI agent helper panel (question box, Send, results)
// =========================================================

import { HELPER_PATH, HELPER_QUESTION_MAX_CHARS } from "./config.js";
import { apiFetch, isSessionEnded } from "./api.js";

let form = null;
let input = null;
let sendButton = null;
let statusLine = null;
let resultsList = null;
let placeholder = null;

// Goes up when the panel is cleared or a new question starts, so an old
// answer that arrives late is thrown away.
let requestId = 0;
let waiting = false;

function setStatus(text) {
    if (statusLine) statusLine.textContent = text || "";
}

function setWaiting(isWaiting) {
    waiting = isWaiting;
    if (sendButton) sendButton.disabled = isWaiting;
}

function clearResults() {
    if (resultsList) resultsList.replaceChildren();
}

function showPlaceholder(show) {
    if (placeholder) placeholder.hidden = !show;
}

// textContent only (never innerHTML): the text comes from files and an LLM.
function renderRows(rows) {
    clearResults();
    for (const row of rows) {
        if (!row || typeof row.excerpt !== "string") continue;

        const item = document.createElement("li");
        item.className = "call-helper-result";

        const title = document.createElement("strong");
        title.className = "call-helper-result-title";
        title.textContent = typeof row.title === "string" ? row.title : "";

        const excerpt = document.createElement("p");
        excerpt.className = "call-helper-result-excerpt";
        excerpt.textContent = row.excerpt;

        const source = document.createElement("span");
        source.className = "call-helper-result-file";
        source.textContent = typeof row.file === "string" ? row.file : "";

        item.append(title, excerpt, source);
        resultsList.append(item);
    }
}

function messageForFailure(result) {
    if (result.reason === "no-token" || result.reason === "unauthorized") {
        return "Your session has ended, so search is off.";
    }
    if (result.reason === "timeout") return "The helper took too long. Try again.";
    if (result.reason === "offline") return "Cannot reach the server. Check your connection.";
    if (result.status === 429) return "Too many questions. Wait a moment, then try again.";
    if (result.status === 400 || result.status === 422) {
        return "That question could not be sent. Check it and try again.";
    }
    return "Something went wrong. Try again shortly.";
}

async function handleSubmit(event) {
    event.preventDefault();
    if (waiting) return;

    const question = input.value.trim();
    if (!question) {
        setStatus("Type a question first.");
        return;
    }
    if (isSessionEnded()) {
        setStatus("Your session has ended, so search is off for this call.");
        return;
    }

    requestId += 1;
    const thisRequest = requestId;
    setWaiting(true);
    clearResults();
    showPlaceholder(false);
    setStatus("Searching…");

    const result = await apiFetch(HELPER_PATH, {
        method: "POST",
        body: { question },
        onSlow: () => {
            if (thisRequest === requestId) setStatus("Still searching…");
        },
    });

    // The panel was cleared (call ended or logout) while we waited
    if (thisRequest !== requestId) return;
    setWaiting(false);

    if (!result.ok) {
        setStatus(messageForFailure(result));
        return;
    }

    const data = result.data || {};
    const rows = Array.isArray(data.rows) ? data.rows : [];

    if (data.status === "found" && rows.length > 0) {
        renderRows(rows);
        setStatus("");
    } else if (data.status === "not_found") {
        setStatus("Nothing found in the knowledge files.");
    } else {
        setStatus("The helper is unavailable. Try again shortly.");
    }
}

export function initHelper() {
    form = document.getElementById("call-helper-form");
    input = document.getElementById("call-helper-search");
    sendButton = document.getElementById("call-helper-send");
    statusLine = document.getElementById("call-helper-status");
    resultsList = document.getElementById("call-helper-results");
    placeholder = document.getElementById("call-helper-placeholder");

    if (!form || !input) return;
    input.maxLength = HELPER_QUESTION_MAX_CHARS;
    form.addEventListener("submit", handleSubmit);
}

// Call this when a call ends or on logout: empties the box, the results
// and the status, and ignores any answer still on its way.
export function clearHelper() {
    requestId += 1;
    setWaiting(false);
    if (input) input.value = "";
    setStatus("");
    clearResults();
    showPlaceholder(true);
}