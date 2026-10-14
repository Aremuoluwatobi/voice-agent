// =========================================================
// auth.js — keeps the login token in sessionStorage
// (the "pocket" of this one browser tab).
// - Survives a page refresh
// - Gone when the tab is closed
// - Never printed to the console
// =========================================================

const TOKEN_KEY = "shopdarret_agent_token";

// Save the token after a successful login.
// Returns true if saved, false if the browser blocked storage.
export function saveToken(token) {
    if (typeof token !== "string" || token === "") return false;
    try {
        sessionStorage.setItem(TOKEN_KEY, token);
        return true;
    } catch {
        // Some private modes / strict settings block storage.
        return false;
    }
}

// Read the saved token. Returns "" if there is none.
export function getToken() {
    try {
        return sessionStorage.getItem(TOKEN_KEY) || "";
    } catch {
        return "";
    }
}

// Delete the token (logout, expired token, any 401).
export function clearToken() {
    try {
        sessionStorage.removeItem(TOKEN_KEY);
    } catch {
        // Nothing to do: if storage is blocked, there is nothing saved.
    }
}

// True if a token is saved (does NOT check that it is still valid —
// only the backend can do that, in step 2d).
export function hasToken() {
    return getToken() !== "";
}
