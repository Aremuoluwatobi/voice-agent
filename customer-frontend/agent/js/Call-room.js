// =========================================================
// Call-room.js - the human agent's audio in the LiveKit room.
// =========================================================

const SAVED_CALL_KEY = "shopdarret_active_call";
const AUDIO_HOLDER_ID = "call-audio-holder";
const TRANSCRIPT_TOPIC = "transcript";   // must match TRANSCRIPT_TOPIC in agent_config.py
const AGENT_IDENTITY_PREFIX = "agent-";  // the AI agent's name in the room starts with this

let room = null; // the LiveKit room we are in (or null)


// ---------- Saved call (survives a refresh, gone when the tab closes) ----------
// Only the handoff ID and the resume secret are saved. The LiveKit pass is not.

export function saveCall(handoffId, resumeSecret) {
    try {
        sessionStorage.setItem(
            SAVED_CALL_KEY, JSON.stringify({ handoffId, resumeSecret }));
    } catch {
        // storage blocked: the call still works, only resume after a refresh does not
    }
}

export function readSavedCall() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(SAVED_CALL_KEY) || "null");
        if (
            saved &&
            typeof saved.handoffId === "string" && saved.handoffId &&
            typeof saved.resumeSecret === "string" && saved.resumeSecret
        ) {
            return saved;
        }
    } catch {
        // not readable: treat as no saved call
    }
    return null;
}

export function clearSavedCall() {
    try {
        sessionStorage.removeItem(SAVED_CALL_KEY);
    } catch {
        // nothing to do
    }
}


// ---------- Room ----------

export function isInRoom() {
    const lk = window.LivekitClient;
    return Boolean(
        lk && room && room.state === lk.ConnectionState.Connected);
}

function getAudioHolder() {
    let holder = document.getElementById(AUDIO_HOLDER_ID);
    if (!holder) {
        holder = document.createElement("div");
        holder.id = AUDIO_HOLDER_ID;
        holder.hidden = true; // the audio still plays when it is hidden
        document.body.appendChild(holder);
    }
    return holder;
}

function removeAudio() {
    const holder = document.getElementById(AUDIO_HOLDER_ID);
    if (holder) holder.replaceChildren();
}

// Join the room and turn the microphone on.
// Returns { ok, micOk }. Never throws.
//   ok:    false if the room could not be joined at all
//   micOk: false if the microphone was refused (the agent can still listen)
// handlers.onEnded(kind): the room ended on its own. kind is
//   "duplicate" (same identity joined elsewhere), "room_deleted", or "other".
// handlers.onAudioBlocked(true/false): the browser blocks sound until a click.
export async function joinRoom({ url, token }, { onEnded, onAudioBlocked, onTranscript } = {}) {
    const lk = window.LivekitClient;
    if (!lk) return { ok: false, micOk: false };

    await leaveRoom(); // never two rooms at once

    const thisRoom = new lk.Room();
    room = thisRoom;

    // Remote voices (the customer, and the AI) need an audio element to be heard.
    thisRoom.on(lk.RoomEvent.TrackSubscribed, (track) => {
        if (room !== thisRoom) return;
        if (track.kind === lk.Track.Kind.Audio) {
            getAudioHolder().appendChild(track.attach());
        }
    });
    thisRoom.on(lk.RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((element) => element.remove());
    });
    thisRoom.on(lk.RoomEvent.AudioPlaybackStatusChanged, () => {
        if (room === thisRoom && typeof onAudioBlocked === "function") {
            onAudioBlocked(!thisRoom.canPlaybackAudio);
        }
    });
    thisRoom.on(lk.RoomEvent.Disconnected, (reason) => {
        if (room !== thisRoom) return; // we left on purpose: stay quiet
        room = null;
        removeAudio();
        let kind = "other";
        if (reason === lk.DisconnectReason.DUPLICATE_IDENTITY) kind = "duplicate";
        else if (reason === lk.DisconnectReason.ROOM_DELETED) kind = "room_deleted";
        if (typeof onEnded === "function") onEnded(kind);
    });

    // Transcript lines sent by the AI agent. Only the agent may send them:
    // customers and humans have other names, which the backend decides.
    thisRoom.on(lk.RoomEvent.DataReceived || "dataReceived", (payload, participant, kind, topic) => {
        if (room !== thisRoom) return;
        if (topic !== TRANSCRIPT_TOPIC) return;
        if (!participant || !participant.identity.startsWith(AGENT_IDENTITY_PREFIX)) {
            console.warn("Transcript data ignored from", participant && participant.identity);
            return;
        }
        if (typeof onTranscript !== "function") return;
        try {
            const data = JSON.parse(new TextDecoder().decode(payload));
            if (data && Array.isArray(data.lines)) onTranscript(data.lines);
        } catch {
            // not readable: ignore
        }
    });

    try {
        await thisRoom.connect(url, token);
    } catch {
        if (room === thisRoom) room = null;
        return { ok: false, micOk: false };
    }

    // The agent pressed End call while we were still connecting
    if (room !== thisRoom) {
        try { await thisRoom.disconnect(); } catch { /* already gone */ }
        return { ok: false, micOk: false };
    }

    let micOk = true;
    try {
        await thisRoom.localParticipant.setMicrophoneEnabled(true);
    } catch {
        micOk = false; // permission refused or no microphone
    }

    if (!thisRoom.canPlaybackAudio && typeof onAudioBlocked === "function") {
        onAudioBlocked(true);
    }
    return { ok: true, micOk };
}

// Leave the room. Safe to call any time, also when not in a room.
export async function leaveRoom() {
    const oldRoom = room;
    room = null; // from now on this room's events are ignored
    removeAudio();
    if (!oldRoom) return;
    try {
        await oldRoom.disconnect(); // also switches the microphone off
    } catch {
        // already disconnected
    }
}

// Must be called from a click. The browser then allows sound.
export async function enableAudio() {
    if (!room) return;
    try {
        await room.startAudio();
    } catch {
        // still blocked: the button stays and the agent can click again
    }
}