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

// ---------- Called once by main.js ----------
// onSuccess(token) runs after a successful login.
export function initLogin({ onSuccess }) {
    const form = document.getElementById("login-form");
    const emailInput = document.getElementById("login-email");
    const passwordInput = document.getElementById("login-password");
    const submitButton = document.getElementById("login-submit");
    const message = document.getElementById("login-message");
    const toggleButton = document.getElementById("toggle-password");
    const toggleIcon = document.getElementById("toggle-password-icon");

    // ----- Message helpers (textContent only, never innerHTML) -----
    function showMessage(text, type) {
        message.textContent = text;
        message.classList.remove("is-error", "is-info");
        message.classList.add(type === "error" ? "is-error" : "is-info");
    }

    function clearMessage() {
        message.textContent = "";
        message.classList.remove("is-error", "is-info");
    }

    function setLoading(loading) {
        isSubmitting = loading;
        submitButton.disabled = loading;
        submitButton.setAttribute("aria-busy", String(loading));
    }

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

        if (isSubmitting) return; // double-click guard

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showMessage(MESSAGES.missingFields, "error");
            return;
        }

        setLoading(true);
        showMessage(MESSAGES.signingIn, "info");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const slowNoticeId = setTimeout(
            () => showMessage(MESSAGES.wakingUp, "info"),
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
                    showMessage(MESSAGES.generic, "error");
                    return;
                }

                clearMessage();
                setPasswordVisible(false); // never leave the password showing
                onSuccess(token);
                return;
            }

            if (response.status === 401) {
                showMessage(MESSAGES.wrongLogin, "error");
            } else if (response.status === 400) {
                showMessage(MESSAGES.missingFields, "error");
            } else if (response.status === 429) {
                showMessage(MESSAGES.tooMany, "error");
            } else {
                showMessage(MESSAGES.generic, "error");
            }
        } catch (error) {
            // AbortError = our 60s timeout; anything else = network / CORS / server down
            if (error.name === "AbortError") {
                showMessage(MESSAGES.timeout, "error");
            } else {
                showMessage(MESSAGES.offline, "error");
            }
        } finally {
            clearTimeout(timeoutId);
            clearTimeout(slowNoticeId);
            setLoading(false);
        }
    });
}
