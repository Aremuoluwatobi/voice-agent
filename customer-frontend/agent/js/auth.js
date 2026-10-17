// =========================================================
// auth.js — keeps the login token in sessionStorage
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


export function isTokenExpired(token = getToken()) {
    try {
        const payloadPart = token.split(".")[1];
        if (!payloadPart) return true;

        // JWT uses base64url: convert to normal base64 and add padding
        let base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
        while (base64.length % 4 !== 0) base64 += "=";

        const payload = JSON.parse(atob(base64));
        if (typeof payload.exp !== "number") return true;

        const nowSeconds = Date.now() / 1000;
        return nowSeconds >= payload.exp;
    } catch {
        return true;
    }
}
