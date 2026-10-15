// =========================================================
// views.js — shows ONE view (login / waiting / call)
// and hides the others. Nothing reloads.
// =========================================================

const VIEW_NAMES = ["login", "waiting", "call"];

let currentView = null;

const viewChangeListeners = [];


export function showView(name) {
    if (!VIEW_NAMES.includes(name)) {
        console.error(`Unknown view: ${name}`);
        return;
    }

    // Show the chosen section, hide the other two
    for (const viewName of VIEW_NAMES) {
        const section = document.getElementById(`view-${viewName}`);
        if (section) {
            section.hidden = viewName !== name;
        }
    }

    // Top bar is for waiting + call only, never on login
    const topBar = document.getElementById("top-bar");
    if (topBar) {
        topBar.hidden = name === "login";
    }

    currentView = name;
    window.scrollTo(0, 0);
    // Tell other files the view changed (e.g. the popup hides itself)
    for (const listener of viewChangeListeners) {
        listener(name);
    }

}

export function getCurrentView() {
    return currentView;
}

// Other files can ask to be told when the view changes.
// listener(name) is called after every showView().
export function onViewChange(listener) {
    viewChangeListeners.push(listener);
}


// Top-bar status, e.g. "Online", "Connecting…", "Can't reach server".
// state: "online" | "checking" | "offline" (used by CSS later for the dot colour)
export function setAgentStatus(text, state) {
    const status = document.getElementById("agent-status");
    if (!status) return;
    status.textContent = text;
    status.setAttribute("data-state", state);
}
