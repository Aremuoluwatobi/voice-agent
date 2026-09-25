const callWidget = document.getElementById('callWidget');
const callFab = document.getElementById('callFab');
const endCallBtn = document.getElementById('endCallBtn');
const callTimerEl = document.getElementById('callTimer');

let timerInterval = null;
let callStartTime = null;
let room = null; // holds the active LiveKit Room instance for this call

// Adjust this to your real deployed FastAPI backend URL and route name.
const FASTAPI_TOKEN_URL = 'https://shopdarret.onrender.com/api/token';

function setCallState(state) {
    callWidget.dataset.callState = state; // "idle" | "connecting" | "active"
}

function startTimer() {
    callStartTime = Date.now();
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    callTimerEl.textContent = '00:00';
}

function updateTimerDisplay() {
    const elapsedSeconds = Math.floor((Date.now() - callStartTime) / 1000);
    const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    const seconds = String(elapsedSeconds % 60).padStart(2, '0');
    callTimerEl.textContent = `${minutes}:${seconds}`;
}

// Custom error type so handleStartCall's catch block can tell a "call already
// active" response apart from any other failure, and show the right message.
class CallBusyError extends Error { }

// Asks FastAPI to check-and-lock, then joins the real LiveKit room.
// Throws on any failure; does not touch call state itself, that's
// handleStartCall's job.
async function connectToCall() {
    const response = await fetch(FASTAPI_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });

    if (response.status === 409) {
        // Adjust this status code if your backend signals "already active"
        // differently.
        throw new CallBusyError('A call is already active.');
    }

    if (!response.ok) {
        throw new Error(`Token request failed with status ${response.status}`);
    }

    const data = await response.json();
    const { token, livekit_url: livekitUrl } = data;
    // Adjust the field names above if your FastAPI route returns different
    // JSON keys.

    const { Room } = LivekitClient;
    room = new Room();
    await room.connect(livekitUrl, token);
}

// Disconnects from the LiveKit room, which is also what triggers the
// agent's shutdown callback on the backend to clear the Redis lock.
async function disconnectFromCall() {
    if (room) {
        await room.disconnect();
        room = null;
    }
}

async function handleStartCall() {
    setCallState('connecting');
    try {
        await connectToCall();
        setCallState('active');
        startTimer();
    } catch (err) {
        console.error('Failed to connect call:', err);
        setCallState('idle');
        if (err instanceof CallBusyError) {
            alert('A call is already in progress. Please try again shortly.');
        } else {
            alert('Could not connect. Please try again.');
        }
    }
}

async function handleEndCall() {
    stopTimer();
    await disconnectFromCall();
    setCallState('idle');
}

callFab.addEventListener('click', handleStartCall);
endCallBtn.addEventListener('click', handleEndCall);