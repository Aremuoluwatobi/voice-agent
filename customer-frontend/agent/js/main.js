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
import { apiFetch } from "./api.js";
import { initSound, refreshSoundButton } from "./sound.js";
import { initIncoming, hideIncomingCall, clearDeclinedCalls } from "./incoming.js";
import { initTranscript, clearTranscript } from "./call-transcript.js";
import { initHandoff, clearHandoff } from "./call-handoff.js";
import { initAgentSocket, startAgentSocket, stopAgentSocket } from "./agent-socket.js";


// ---------- Sound (ring + "Click to enable sound" button) ----------
initSound();


// ---------- Dashboard socket ----------
const SESSION_ENDED_MESSAGE = "Your session has ended. Please sign in again.";
const SIGN_IN_AGAIN_MESSAGE = "Please sign in again.";

initAgentSocket({
  onOnline: () => {
    resetReconnect(); // next drop starts again at about 1 s
    setAgentStatus("Online", "online");
  },

  onRejected: (reason) => {
    resetReconnect();
    clearToken();
    showView("login"); // runs the login clean-up listener below
    setLoginStatus(
      reason === "expired" ? SESSION_ENDED_MESSAGE : SIGN_IN_AGAIN_MESSAGE,
      "info"
    );
  },


  onDropped: () => scheduleReconnect(),
});


// ---------- Reconnect ----------
let reconnectTimer = null;
let reconnectAttempt = 0;
let checkInFlight = false;

function canReconnect() {
  return hasToken() && getCurrentView() !== "login";
}

function nextReconnectDelay() {
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
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
  if (isTokenExpired(getToken())) {
    resetReconnect();
    clearToken();
    showView("login");
    setLoginStatus(SESSION_ENDED_MESSAGE, "info");
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

  // 2b. 401 / no token → api.js has already cleared the token and shown login.
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
