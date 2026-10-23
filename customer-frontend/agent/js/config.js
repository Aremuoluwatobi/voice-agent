// =========================================================
// config.js — settings used by the other files
// =========================================================

export const API_BASE_URL = "https://shopdarret.onrender.com";

// Backend routes
export const LOGIN_PATH = "/agent/login";

export const VERIFY_PATH = "/agent/dashboard";

export const HELPER_PATH = "/agent/helper";

export const HELPER_QUESTION_MAX_CHARS = 500;

// -----dashboard WebSocket -----

export const AGENT_WS_PATH = "/agent/ws";


export const PING_INTERVAL_MS = 30000;

export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 30000;




export const SLOW_NOTICE_MS = 5000;


export const REQUEST_TIMEOUT_MS = 60000;


export const ICON_EYE_OFF = "/agent/icons/PLACEHOLDER_EYE_OFF.svg";

// ----- Step 3a: incoming-call popup + ring -----
export const INCOMING_TIMEOUT_MS = 30000;
export const RING_INTERVAL_MS = 2500;
export const SUMMARY_MAX_CHARS = 200;
