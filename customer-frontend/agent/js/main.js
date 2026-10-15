// =========================================================
// main.js — starting point. Connects the other files.
// Loaded by index.html with type="module".
// =========================================================

import { VERIFY_PATH } from "./config.js";
import { showView, setAgentStatus } from "./views.js";
import { initLogin, setLoginStatus } from "./login.js";
import {
  saveToken,
  getToken,
  hasToken,
  clearToken,
  isTokenExpired,
} from "./auth.js";
import { apiFetch } from "./api.js";

// ---------- Login ----------
initLogin({
  onSuccess: (token) => {
    saveToken(token);
    setAgentStatus("Online", "online");
    showView("waiting");
  },
});

// ---------- Logout ----------
const logoutButton = document.getElementById("logout-button");
if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    clearToken();
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

  // 2. Token clearly expired (read locally) → login, no dashboard flash
  if (isTokenExpired(getToken())) {
    clearToken();
    showView("login");
    setLoginStatus("Your session has ended. Please sign in again.", "info");
    return;
  }

  // 3. Token looks fine → show the dashboard straight away,
  //    and confirm with the backend in the background.
  showView("waiting");
  setAgentStatus("Connecting…", "checking");

  const result = await apiFetch(VERIFY_PATH, {
    onSlow: () => setAgentStatus("Server waking up…", "checking"),
  });

  if (result.ok) {
    setAgentStatus("Online", "online");
    // Step 3: open the incoming-call WebSocket HERE,
    // only after the backend has confirmed the token.
    return;
  }

  if (result.reason === "unauthorized" || result.reason === "no-token") {
    // api.js already cleared the token and showed login + message
    return;
  }

  // Network problem / timeout / server error:
  // stay on the dashboard, keep the token, tell the agent.
  setAgentStatus("Can't reach server. Refresh to retry.", "offline");
}

checkSession();
