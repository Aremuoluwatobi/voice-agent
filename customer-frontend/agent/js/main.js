// =========================================================
// main.js — starting point. Connects the other files.
// Loaded by index.html with type="module".
// =========================================================

import { VERIFY_PATH } from "./config.js";
import { showView } from "./views.js";
import { initLogin, setLoginStatus, setLoginBusy } from "./login.js";
import { saveToken, hasToken, clearToken } from "./auth.js";
import { apiFetch } from "./api.js";

// ---------- Login ----------
initLogin({
    onSuccess: (token) => {
        saveToken(token);
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

// ---------- On page open: is there a saved, still-valid token? ----------
async function checkSession() {
    showView("login");

    if (!hasToken()) {
        return; // nothing saved → just show login
    }

    // Token saved: stay on login (no flash), lock the form, ask the backend
    setLoginBusy(true);
    setLoginStatus("Checking your session…", "info");

    const result = await apiFetch(VERIFY_PATH, {
        onSlow: () =>
            setLoginStatus("Server is waking up, this can take up to a minute…", "info"),
    });

    setLoginBusy(false);

    if (result.ok) {
        setLoginStatus("");
        showView("waiting");
        return;
    }

    if (result.reason === "unauthorized" || result.reason === "no-token") {
        // api.js already cleared the token, showed login and a message
        return;
    }

    // Network problem / timeout / server error: keep the token, let them retry
    setLoginStatus("Can't reach the server. Refresh the page to try again.", "error");
}

checkSession();
