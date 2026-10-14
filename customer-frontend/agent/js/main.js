// main.js — starting point. Connects the other files

import { showView } from "./views.js";
import { initLogin } from "./login.js";

initLogin({
    onSuccess: (token) => {
        // Step 2c: save the token in sessionStorage here.
        // For now (2b) the token is not stored, so a refresh returns to login.
        void token;
        showView("waiting");
    },
});

// Always start on the login view (2d will check for a saved token first)
showView("login");
