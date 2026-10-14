// =========================================================
// api.js — the ONE place every protected request goes through.
// - Adds "Authorization: Bearer <token>" automatically
// - Any 401 → delete the token, go back to login
// - Same timeout + "waking up" pattern as login
// =========================================================

import { API_BASE_URL, SLOW_NOTICE_MS, REQUEST_TIMEOUT_MS } from "./config.js";
import { getToken, clearToken } from "./auth.js";
import { showView } from "./views.js";
import { setLoginStatus } from "./login.js";

// Result shape returned to callers:
// { ok: true,  status: 200, data: {...} }
// { ok: false, status: 401, reason: "unauthorized" }
// { ok: false, status: 0,   reason: "no-token" | "timeout" | "offline" }
// { ok: false, status: 4xx/5xx, reason: "error" }

export async function apiFetch(path, { method = "GET", body, onSlow } = {}) {
    const token = getToken();
    if (!token) {
        handleUnauthorized();
        return { ok: false, status: 0, reason: "no-token" };
    }

    const headers = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const slowId = onSlow ? setTimeout(onSlow, SLOW_NOTICE_MS) : null;

    try {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });

        if (response.status === 401) {
            handleUnauthorized();
            return { ok: false, status: 401, reason: "unauthorized" };
        }

        if (!response.ok) {
            return { ok: false, status: response.status, reason: "error" };
        }

        let data = null;
        try {
            data = await response.json();
        } catch {
            data = null;
        }
        return { ok: true, status: response.status, data };
    } catch (error) {
        const reason = error.name === "AbortError" ? "timeout" : "offline";
        return { ok: false, status: 0, reason };
    } finally {
        clearTimeout(timeoutId);
        if (slowId) clearTimeout(slowId);
    }
}

// Any 401 anywhere ends up here
export function handleUnauthorized() {
    clearToken();
    showView("login");
    setLoginStatus("Your session has ended. Please sign in again.", "info");
}
