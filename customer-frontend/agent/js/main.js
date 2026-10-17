// =========================================================
// main.js — starting point. Connects the other files.
// Loaded by index.html with type="module".
// =========================================================

import { VERIFY_PATH } from "./config.js";
import { showView, setAgentStatus, onViewChange } from "./views.js";
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


// ---------- Sound (ring + "Click to enable sound" button) ----------
initSound();


// ---------- Active call view ----------

initTranscript();
initHandoff();

// Going back to login (Log out, any 401, expired or missing token)
onViewChange((name) => {
  if (name !== "login") return;
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
initLogin({
  onSuccess: (token) => {
    saveToken(token);
    setAgentStatus("Online", "online");
    showView("waiting");
    refreshSoundButton();
    clearDeclinedCalls();
  },
});

// ---------- Logout ----------
const logoutButton = document.getElementById("logout-button");
if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    clearToken();
    clearDeclinedCalls();
    showView("login");
    setLoginStatus("You have been logged out.", "info");
  });
}

// ---------- On page open ----------
// All views start hidden in the HTML, so nothing flashes.
async function checkSession() {
  // 1. No token → login
  if (!hasToken()) {
    showView("login");
    return;
  }


  if (isTokenExpired(getToken())) {
    clearToken();
    showView("login");
    setLoginStatus("Your session has ended. Please sign in again.", "info");
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
    setAgentStatus("Online", "online");

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
