// =========================================================
// main.js — starting point. Connects the other files.
// =========================================================

import {
  VERIFY_PATH,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
} from "./config.js";
import { showView, setAgentStatus, onViewChange, getCurrentView } from "./views.js";
import { initLogin, setLoginStatus } from "./login.js";
import {
  saveToken,
  getToken,
  hasToken,
  clearToken,
  isTokenExpired,
} from "./auth.js";
import { apiFetch, endSession, isSessionEnded, clearSessionEnded } from "./api.js";
import { initSound, refreshSoundButton } from "./sound.js";
import { initIncoming, hideIncomingCall, clearDeclinedCalls, showIncomingCall, getCurrentAlert } from "./incoming.js";
import { initTranscript, clearTranscript, addTranscriptLine } from "./call-transcript.js";
import { initHandoff, clearHandoff, showHandoff } from "./call-handoff.js";
import { initAgentSocket, startAgentSocket, stopAgentSocket, sendAgentMessage } from "./agent_socket.js";
import {
  saveCall,
  readSavedCall,
  clearSavedCall,
  joinRoom,
  leaveRoom,
  enableAudio,
  isInRoom,
} from "./Call-room.js";


// ---------- Sound (ring + "Click to enable sound" button) ----------
initSound();


// ---------- Dashboard socket (3b piece 5) ----------
// "Online" only shows after the server's {"type":"ok"}.
const SESSION_ENDED_MESSAGE = "Your session has ended. Please sign in again.";
const SIGN_IN_AGAIN_MESSAGE = "Please sign in again.";

initAgentSocket({
  onOnline: () => {
    resetReconnect(); // next drop starts again at about 1 s
    setAgentStatus("Online", "online");
    // Step 2: every new socket has a new connection ID on the server.
    // If a call is saved, take it back on this socket (refresh or reconnect).
    resumeSavedCall();
  },

  // Step 3: the server rejected the socket (closing message, or 1008 as backup).
  // Never reconnect. The socket is already closed by agent-socket.js.
  // Step 5: only "expired" on the call view keeps the call; anything else -> login.
  onRejected: (reason) => {
    resetReconnect();
    endSession(
      reason === "expired" ? SESSION_ENDED_MESSAGE : SIGN_IN_AGAIN_MESSAGE,
      reason
    );
  },

  // Step 4: any other drop (1006, Render deploy, Wi-Fi, 75 s heartbeat close).
  // Wait, check GET /agent/dashboard, then reconnect.
  onDropped: () => scheduleReconnect(),

  onMessage: (message) => handleServerMessage(message),
});


// ---------- Reconnect (3b piece 5, step 4) ----------
// Doubling waits with jitter: about 1, 2, 4, 8, 16 s, then 30 s max.
// Only one wait at a time. Never after Log out, a rejection, or on the login view.
let reconnectTimer = null;  // the pending wait, or null
let reconnectAttempt = 0;   // how many waits since the last "Online"
let checkInFlight = false;  // a GET /agent/dashboard check is running

function canReconnect() {
  // Never after the session ended during a call (no "Reconnecting…", decision v25)
  return hasToken() && getCurrentView() !== "login" && !isSessionEnded();
}

function nextReconnectDelay() {
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
  // Jitter: each wait is 80–120% of the base (capped at the max), so dashboards
  // dropped by the same Render deploy don't all retry at the same moment.
  const jittered = base * (0.8 + Math.random() * 0.4);
  return Math.round(Math.min(RECONNECT_MAX_MS, jittered));
}

function scheduleReconnect() {
  if (reconnectTimer !== null || checkInFlight) return; // never two waits
  if (!canReconnect()) return;
  setAgentStatus("Reconnecting…", "checking");
  reconnectTimer = setTimeout(tryReconnect, nextReconnectDelay());
}

async function tryReconnect() {
  reconnectTimer = null;
  if (!canReconnect()) return;

  // Expired while offline (e.g. laptop closed): no need to ask the server.
  // A normal expiry: stays on the call view, login anywhere else.
  if (isTokenExpired(getToken())) {
    resetReconnect();
    endSession(SESSION_ENDED_MESSAGE, "expired");
    return;
  }

  // 1. Is my login still valid?
  checkInFlight = true;
  const result = await apiFetch(VERIFY_PATH, {
    onSlow: () => setAgentStatus("Server waking up…", "checking"),
  });
  checkInFlight = false;

  // Logged out (or sent to login) while the check was running: stop here.
  if (!canReconnect()) return;

  // 2a. 200 → open a new socket (sends the token again). "Online" comes on ok.
  if (result.ok) {
    setAgentStatus("Reconnecting…", "checking");
    startAgentSocket(getToken());
    return;
  }

  // 2b. 401 / no token → api.js has already handled it (login, or call notice).
  if (result.reason === "unauthorized" || result.reason === "no-token") {
    resetReconnect();
    return;
  }

  // 2c. Network still down / timeout / server error → wait longer, try again.
  scheduleReconnect();
}

function resetReconnect() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempt = 0;
}


// ---------- Active call view ----------

initTranscript();
initHandoff();

// Going back to login (Log out, any 401, expired or missing token, socket rejected)
onViewChange((name) => {
  if (name !== "login") return;
  resetReconnect();    // cancel any pending reconnect wait
  stopAgentSocket();   // sends "leaving" (if online), then closes; never reconnects
  clearSessionEnded(); // reset the "session ended" flag and hide the call notice
  dropCallLocally();   // leave the LiveKit room and forget the saved call
  clearTranscript();
  clearHandoff();
  const helperSearch = document.getElementById("call-helper-search");
  if (helperSearch) helperSearch.value = "";
});


// ---------- Joining the call with the microphone (step 2) ----------

function showCallNotice(text) {
  const notice = document.getElementById("call-status-notice");
  if (!notice) return;
  notice.textContent = text || "";
  notice.hidden = !text;
}

function showAudioButton(show) {
  const button = document.getElementById("call-audio-button");
  if (button) button.hidden = !show;
}

// The LiveKit room ended on its own (not because of End call).
function handleRoomEnded(kind) {
  showAudioButton(false);
  if (kind === "duplicate") {
    // The call was opened in another tab. This tab must not take it back.
    clearSavedCall();
    showCallNotice("This call was opened in another tab, so it was closed here.");
    return;
  }
  if (kind === "room_deleted") {
    showCallNotice("The call has ended. Press End call to continue.");
    return;
  }
  showCallNotice("You were disconnected from the call. Press End call, or refresh to rejoin.");
}

// Lines sent by the AI agent over the room. The box drops lines it already has.
function handleTranscriptLines(lines) {
  for (const line of lines) addTranscriptLine(line);
}

// info = the accepted or resumed message (livekit_url, room_token, ...)
async function joinCall(info) {
  if (isInRoom()) return; // only the socket dropped: the call itself is still up
  // No pass: stay quiet. A call_error message follows and explains it.
  if (typeof info.livekit_url !== "string" || !info.livekit_url) return;
  if (typeof info.room_token !== "string" || !info.room_token) return;

  showCallNotice("Joining the call…");
  const result = await joinRoom(
    { url: info.livekit_url, token: info.room_token },
    { onEnded: handleRoomEnded, onAudioBlocked: showAudioButton, onTranscript: handleTranscriptLines }
  );

  // End call (or logout) happened while we were joining
  if (getCurrentView() !== "call") return;

  if (!result.ok) {
    showCallNotice("Could not join the call audio. Check your connection, then refresh to try again.");
    return;
  }
  if (!result.micOk) {
    showCallNotice("Your microphone is blocked. Allow it in the browser, then refresh to rejoin.");
    return;
  }
  showCallNotice("");
}

// After a refresh or a socket reconnect: prove "I am the winner" with the secret.
function resumeSavedCall() {
  const saved = readSavedCall();
  if (!saved) return;
  sendAgentMessage({
    type: "resume",
    handoff_id: saved.handoffId,
    resume_secret: saved.resumeSecret,
  });
}

// Leave the room and forget the call on this browser. Does not change the view.
function dropCallLocally() {
  leaveRoom(); // async, nobody needs to wait for it
  clearSavedCall();
  showAudioButton(false);
  showCallNotice("");
}

// The normal end of a call on this dashboard: back to the waiting view.
function endCallLocally() {
  dropCallLocally();
  clearTranscript();
  clearHandoff();
  const helperSearch = document.getElementById("call-helper-search");
  if (helperSearch) helperSearch.value = "";
  showView("waiting");
  refreshSoundButton();
}

// "Click to enable audio" button (browsers block sound until a click)
const callAudioButton = document.getElementById("call-audio-button");
if (callAudioButton) {
  callAudioButton.addEventListener("click", async () => {
    await enableAudio();
    showAudioButton(false);
  });
}


// ---------- Messages from the server (B4) ----------
function handleServerMessage(message) {
  if (!message || typeof message !== "object") return;
  const handoffId = typeof message.handoff_id === "string" ? message.handoff_id : "";

  if (message.type === "incoming") {
    const shown = showIncomingCall({ handoff_id: handoffId, summary: message.summary });
    // Not shown (for example this agent is on a call): decline at once,
    // so the AI does not wait the full 30 s for this dashboard.
    if (!shown && handoffId) {
      sendAgentMessage({ type: "decline", handoff_id: handoffId });
    }
    return;
  }

  // accepted: this agent won. Open the call view, save the call, join the room.
  if (message.type === "accepted") {
    const current = getCurrentAlert();
    if (current && current.handoffId === handoffId) {
      hideIncomingCall();
      showView("call");
      showHandoff({
        summary: message.summary,
        suggested_resolution: message.suggested_resolution,
      });
      if (typeof message.resume_secret === "string" && message.resume_secret) {
        saveCall(handoffId, message.resume_secret);
      }
      joinCall(message);
    }
    return;
  }

  // call_error: this agent won, but the server could not make the room pass
  if (message.type === "call_error") {
    if (getCurrentView() === "call") {
      showCallNotice("You accepted the call, but the audio could not start. Press End call.");
    }
    return;
  }

  // resumed: the server took this new connection as the winner, with a fresh pass
  if (message.type === "resumed") {
    const saved = readSavedCall();
    if (!saved || saved.handoffId !== handoffId) return;
    if (getCurrentView() !== "call") showView("call");
    showHandoff({
      summary: message.summary,
      suggested_resolution: message.suggested_resolution,
    });
    joinCall(message);
    return;
  }

  // resume_failed: the secret was refused or the call is over
  if (message.type === "resume_failed") {
    const saved = readSavedCall();
    if (saved && saved.handoffId === handoffId) endCallLocally();
    return;
  }

  // taken, too_late: close the popup, but only if it is the same alert
  if (message.type === "taken" || message.type === "too_late") {
    const current = getCurrentAlert();
    if (current && current.handoffId === handoffId) {
      hideIncomingCall();
    }
  }
}

// ---------- Incoming-call popup ----------
initIncoming({
  onAccept: (alert) => {
    // The popup stays (ring stopped, buttons disabled) until the server answers.
    // accepted, taken or too_late close it through handleServerMessage.
    const sent = sendAgentMessage({ type: "accept", handoff_id: alert.handoffId });
    if (!sent) hideIncomingCall(); // socket is down: nobody can accept
  },
  onDecline: (alert) => {
    // incoming.js already hid the popup and remembered the decline
    sendAgentMessage({ type: "decline", handoff_id: alert.handoffId });
  },
});

// ---------- Login ----------
// checkSession() shows the waiting view with "Connecting…", checks the token
// with GET /agent/dashboard, and only then opens the socket.
initLogin({
  onSuccess: (token) => {
    saveToken(token);
    checkSession();
  },
});

// ---------- Logout ----------
// showView("login") runs the listener above, which closes the socket,
// leaves the room and cancels any reconnect.
const logoutButton = document.getElementById("logout-button");
if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    // Log out during a call ends the call first: clear it on the server too.
    // Sent before the login clean-up, which sends "leaving" and closes the socket.
    const saved = readSavedCall();
    if (saved) sendAgentMessage({ type: "end_call", handoff_id: saved.handoffId });
    clearToken();
    clearDeclinedCalls();
    showView("login");
    setLoginStatus("You have been logged out.", "info");
  });
}

// ---------- End call (step 4, first part) ----------
// Leaves the room and clears the call. It does not yet tell the customer's
// side that the human has left (that is a later part of step 4).
const endCallButton = document.getElementById("end-call-button");
if (endCallButton) {
  endCallButton.addEventListener("click", () => {
    // Tell the server to delete the resume secret. If the socket is down, the
    // secret expires by itself after 2 hours, and this browser forgets it now.
    const saved = readSavedCall();
    if (saved) sendAgentMessage({ type: "end_call", handoff_id: saved.handoffId });

    // The session ended during the call (token expired): now go to login.
    if (isSessionEnded()) {
      dropCallLocally();
      clearToken();
      clearDeclinedCalls();
      showView("login");
      setLoginStatus(SESSION_ENDED_MESSAGE, "info");
      return;
    }
    // Normal end: empty the call view and go back to waiting.
    endCallLocally();
  });
}

// ---------- On page open (and after login) ----------
// All views start hidden in the HTML, so nothing flashes.
// Step 2: a refresh no longer drops the call (this replaces decision v25).
// If a call is saved, show the call view and take the call back once the socket is Online.
async function checkSession() {
  // 1. No token → login
  if (!hasToken()) {
    showView("login");
    return;
  }


  if (isTokenExpired(getToken())) {
    clearToken();
    showView("login");
    setLoginStatus(SESSION_ENDED_MESSAGE, "info");
    return;
  }


  const hasSavedCall = Boolean(readSavedCall());
  showView(hasSavedCall ? "call" : "waiting");
  if (hasSavedCall) showCallNotice("Rejoining your call…");
  setAgentStatus("Connecting…", "checking");
  refreshSoundButton();
  clearDeclinedCalls();

  const result = await apiFetch(VERIFY_PATH, {
    onSlow: () => setAgentStatus("Server waking up…", "checking"),
  });

  if (result.ok) {
    // Token confirmed → open the socket. "Online" comes from onOnline.
    // If the agent logged out while waiting, getToken() is empty and nothing opens.
    setAgentStatus("Connecting…", "checking");
    startAgentSocket(getToken());
    return;
  }

  if (result.reason === "unauthorized" || result.reason === "no-token") {

    return;
  }

  // Network problem / timeout / server error:
  // stay on the dashboard, keep the token, tell the agent.
  setAgentStatus("Can't reach server. Refresh to retry.", "offline");
}

checkSession();