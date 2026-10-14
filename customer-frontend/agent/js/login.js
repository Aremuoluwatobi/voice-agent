// =========================================================
// login.js — the Sign in form + the show/hide password button
// =========================================================

import {
    API_BASE_URL,
    LOGIN_PATH,
    SLOW_NOTICE_MS,
    REQUEST_TIMEOUT_MS,
    ICON_EYE_OFF,
} from "./config.js";

// Messages shown under the Sign in button
const MESSAGES = {
    signingIn: "Signing in…",
    wakingUp: "Server is waking up, this can take up to a minute…",
    wrongLogin: "Email or password is wrong.",
    missingFields: "Email and password needed.",
    tooMany: "Too many attempts. Please wait a moment and try again.",
    timeout: "The server took too long to respond. Please try again.",
    offline: "Can't reach the server. Please try again.",
    generic: "Something went wrong. Please try again.",
};

let isSubmitting = false;

// ---------- Helpers other files can use (main.js, api.js) ----------

// Show a message under the Sign in button. type: "error" | "info".
// Pass "" as text to clear it. Uses textContent only (never innerHTML).
export function setLoginStatus(text, type = "info") {
    const message = document.getElementById("login-message");
    if (!message) return;
    message.textContent = text;
    message.classList.remove("is-error", "is-info");
    if (text) {
        message.classList.add(type === "error" ? "is-error" : "is-info");
    }
}

// Disable / enable the Sign in button (also blocks the Enter key)
export function setLoginBusy(busy) {
    const submitButton = document.getElementById("login-submit");
    isSubmitting = busy;
    if (submitButton) {
        submitButton.disabled = busy;
        submitButton.setAttribute("aria-busy", String(busy));
    }
}

// ---------- Called once by main.js ----------
// onSuccess(token) runs after a successful login.
export function initLogin({ onSuccess }) {
    const form = document.getElementById("login-form");
    const emailInput = document.getElementById("login-email");
    const passwordInput = document.getElementById("login-password");
    const toggleButton = document.getElementById("toggle-password");
    const toggleIcon = document.getElementById("toggle-password-icon");

    // ----- Show / hide password -----
    const eyeIconSrc = toggleIcon.getAttribute("src"); // the "eye" path from the HTML
    toggleButton.setAttribute("aria-pressed", "false");

    function setPasswordVisible(visible) {
        passwordInput.type = visible ? "text" : "password";
        toggleIcon.setAttribute("src", visible ? ICON_EYE_OFF : eyeIconSrc);
        toggleButton.setAttribute("aria-label", visible ? "Hide password" : "Show password");
        toggleButton.setAttribute("aria-pressed", String(visible));
    }

    toggleButton.addEventListener("click", () => {
        setPasswordVisible(passwordInput.type === "password");
    });

    // ----- Sign in -----
    form.addEventListener("submit", async (event) => {
        event.preventDefault(); // stop the page from reloading

        if (isSubmitting) return; // double-click guard (also blocks during session check)

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            setLoginStatus(MESSAGES.missingFields, "error");
            return;
        }

        setLoginBusy(true);
        setLoginStatus(MESSAGES.signingIn, "info");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const slowNoticeId = setTimeout(
            () => setLoginStatus(MESSAGES.wakingUp, "info"),
            SLOW_NOTICE_MS
        );

        try {
            const response = await fetch(`${API_BASE_URL}${LOGIN_PATH}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
                signal: controller.signal,
            });

            clearTimeout(slowNoticeId);

            if (response.ok) {
                let data = null;
                try {
                    data = await response.json();
                } catch {
                    data = null;
                }

                const token = data && typeof data.token === "string" ? data.token : "";
                if (!token) {
                    setLoginStatus(MESSAGES.generic, "error");
                    return;
                }

                setLoginStatus("");
                setPasswordVisible(false); // never leave the password showing
                onSuccess(token);
                return;
            }

            if (response.status === 401) {
                setLoginStatus(MESSAGES.wrongLogin, "error");
            } else if (response.status === 400) {
                setLoginStatus(MESSAGES.missingFields, "error");
            } else if (response.status === 429) {
                setLoginStatus(MESSAGES.tooMany, "error");
            } else {
                setLoginStatus(MESSAGES.generic, "error");
            }
        } catch (error) {
            // AbortError = our 60s timeout; anything else = network / CORS / server down
            if (error.name === "AbortError") {
                setLoginStatus(MESSAGES.timeout, "error");
            } else {
                setLoginStatus(MESSAGES.offline, "error");
            }
        } finally {
            clearTimeout(timeoutId);
            clearTimeout(slowNoticeId);
            setLoginBusy(false);
        }
    });
}
