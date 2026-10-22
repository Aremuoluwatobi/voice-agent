// Live transcript box for the active call view.

import { onViewChange } from "/agent/js/views.js";

const MAX_LINES = 300;          // keeps memory small on long calls
const NEAR_BOTTOM_PX = 40;      // "close enough" to the bottom

const SPEAKERS = {
    customer: { label: "Customer", tagClass: "call-tag-customer" },
    ai: { label: "AI Agent", tagClass: "call-tag-ai" },
    agent: { label: "You", tagClass: "call-tag-agent" },
    system: { label: "Notice", tagClass: "call-tag-ai" },
};

let list = null;
let jumpButton = null;
let emptyNote = null;
const seenSeq = new Set();

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

    // The same line can arrive twice (live, and again after a join or refresh): show it once.
    if (Number.isInteger(line.seq)) {
        if (seenSeq.has(line.seq)) return false;
        seenSeq.add(line.seq);
    }

    const wasNearBottom = isNearBottom();   // check BEFORE adding

    const item = document.createElement("li");
    item.className = "call-line";

    const meta = document.createElement("div");
    meta.className = "call-line-meta";

    const tag = document.createElement("span");
    tag.className = `call-tag ${speaker.tagClass}`;
    tag.textContent = speaker.label;
    meta.append(tag);

    // The agent sends when the speaker STARTED (seconds since 1970).
    let timeText = "";
    if (typeof line.started === "number") {
        timeText = new Date(line.started * 1000).toLocaleTimeString([], {
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
        });
        item.dataset.started = String(line.started);
    } else if (typeof line.time === "string") {
        timeText = line.time.slice(0, 8);
    }
    if (timeText) {
        const time = document.createElement("span");
        time.className = "call-line-time";
        time.textContent = timeText;
        meta.append(time);
    }

    const body = document.createElement("p");
    body.className = "call-line-text";
    body.textContent = text;

    item.append(meta, body);

    // Place the line by when the speaker started, not by when it arrived.
    let before = null;
    if (typeof line.started === "number") {
        let node = list.lastElementChild;
        while (node && Number(node.dataset.started) > line.started) {
            before = node;
            node = node.previousElementSibling;
        }
    }
    list.insertBefore(item, before);

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
    seenSeq.clear();
    list.replaceChildren();
    jumpButton.hidden = true;
    updateEmptyNote();
}
