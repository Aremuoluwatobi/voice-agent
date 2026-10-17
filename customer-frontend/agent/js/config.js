// =========================================================
// config.js — settings used by the other files
// =========================================================

export const API_BASE_URL = "https://shopdarret.onrender.com";

// Backend routes
export const LOGIN_PATH = "/agent/login";

export const VERIFY_PATH = "/agent/dashboard";   // "is my token still valid?"


// After this long with no answer, tell the agent the server is waking up
export const SLOW_NOTICE_MS = 5000;   // 5 seconds

// Give up completely after this long
export const REQUEST_TIMEOUT_MS = 60000;   // 60 seconds

// Icon shown while the password is VISIBLE 
export const ICON_EYE_OFF = "/agent/icons/PLACEHOLDER_EYE_OFF.svg";

// ----- Step 3a: incoming-call popup + ring -----
export const INCOMING_TIMEOUT_MS = 30000; // same 30s as my-agent's wait
export const RING_INTERVAL_MS = 2500;     // one ring every 2.5s
export const SUMMARY_MAX_CHARS = 200;     // popup summary is cut after this
export const ORDER_ID_MAX_CHARS = 40;
