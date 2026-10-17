// /agent/js/call-transcript.js
// Live transcript box for the active call view.

import { onViewChange } from "/agent/js/views.js";

const MAX_LINES = 300;          // keeps memory small on long calls
const NEAR_BOTTOM_PX = 40;      // "close enough" to the bottom

const SPEAKERS = {
    customer: { label: "Customer", tagClass: "call-tag-customer" },
    ai: { label: "AI Agent", tagClass: "call-tag-ai" },
    agent: { label: "You", tagClass: "call-tag-agent" },
};

let list = null;
let jumpButton = null;
let emptyNote = null;

function isNearBottom() {
    return list.scrollHeight - list.scrollTop - list.clientHeight <= NEAR_BOTTOM_PX;
}

function scrollToLatest() {
    list.scrollTop = list.scrollHeight;
    jumpButton.hidden = true;
}

function updateEmptyNote() {
    emptyNote.hidden = list.children.length > 0;
}

// Call once (from main.js) after the page loads.
export function initTranscript() {
    if (list) return true;               // already set up: don't add listeners twice

    const foundList = document.getElementById("call-transcript-list");
    const foundJump = document.getElementById("call-jump-latest");
    const foundEmpty = document.getElementById("call-transcript-empty");
    if (!foundList || !foundJump || !foundEmpty) return false;   // nothing saved, so a retry still works

    list = foundList;
    jumpButton = foundJump;
    emptyNote = foundEmpty;

    jumpButton.addEventListener("click", scrollToLatest);

    // hide the button again once the agent scrolls back down by hand
    list.addEventListener("scroll", () => {
        if (isNearBottom()) jumpButton.hidden = true;
    }, { passive: true });

    // open the call view at the newest line
    onViewChange((name) => {
        if (name === "call") scrollToLatest();
    });

    updateEmptyNote();
    return true;
}

export function addTranscriptLine(line) {
    if (!list) return false;

    const speaker = SPEAKERS[line?.speaker];
    const text = typeof line?.text === "string" ? line.text.trim() : "";
    if (!speaker || !text) return false;

    const wasNearBottom = isNearBottom();   // check BEFORE adding

    const item = document.createElement("li");
    item.className = "call-line";

    const meta = document.createElement("div");
    meta.className = "call-line-meta";

    const tag = document.createElement("span");
    tag.className = `call-tag ${speaker.tagClass}`;
    tag.textContent = speaker.label;
    meta.append(tag);

    if (typeof line.time === "string" && line.time) {
        const time = document.createElement("span");
        time.className = "call-line-time";
        time.textContent = line.time.slice(0, 8);
        meta.append(time);
    }

    const body = document.createElement("p");
    body.className = "call-line-text";
    body.textContent = text;

    item.append(meta, body);
    list.append(item);

    // drop the oldest lines on very long calls
    while (list.children.length > MAX_LINES) {
        list.firstElementChild.remove();
    }

    updateEmptyNote();

    if (wasNearBottom) {
        scrollToLatest();
    } else {
        jumpButton.hidden = false;
    }
    return true;
}

// Empty the box (start of a new call / End call).
export function clearTranscript() {
    if (!list) return;
    list.replaceChildren();
    jumpButton.hidden = true;
    updateEmptyNote();
}
