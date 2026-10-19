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
import { initIncoming, hideIncomingCall, clearDeclinedCalls } from "./incoming.js";
import { initTranscript, clearTranscript } from "./call-transcript.js";
import { initHandoff, clearHandoff } from "./call-handoff.js";
import { initAgentSocket, startAgentSocket, stopAgentSocket } from "./agent_socket.js";


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
  clearTranscript();
  clearHandoff();
  const helperSearch = document.getElementById("call-helper-search");
  if (helperSearch) helperSearch.value = "";
});


// ---------- Incoming-call popup ----------
initIncoming({
  onAccept: () => {

    hideIncomingCall();
  },
  onDecline: () => {

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
// showView("login") runs the listener above, which closes the socket
// and cancels any reconnect.
const logoutButton = document.getElementById("logout-button");
if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    clearToken();
    clearDeclinedCalls();
    showView("login");
    setLoginStatus("You have been logged out.", "info");
  });
}

// ---------- On page open (and after login) ----------
// All views start hidden in the HTML, so nothing flashes.
// (Unchanged by step 5: a refresh drops the LiveKit room anyway, decision v25.)
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


  showView("waiting");
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
