// =========================================================
// config.js — settings used by the other files
// Nothing in this file is secret: anyone can see these
// values in the browser's Network tab.
// =========================================================

export const API_BASE_URL = "https://shopdarret.onrender.com";

// Backend routes
export const LOGIN_PATH = "/agent/login";

export const VERIFY_PATH = "/agent/dashboard";   // "is my token still valid?"


// After this long with no answer, tell the agent the server is waking up
export const SLOW_NOTICE_MS = 5000;   // 5 seconds

// Give up completely after this long
export const REQUEST_TIMEOUT_MS = 60000;   // 60 seconds

// Icon shown while the password is VISIBLE (the "eye" icon path is read from the HTML)
export const ICON_EYE_OFF = "/agent/icons/PLACEHOLDER_EYE_OFF.svg";
