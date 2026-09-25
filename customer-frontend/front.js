const callWidget = document.getElementById('callWidget');
const callFab = document.getElementById('callFab');
const endCallBtn = document.getElementById('endCallBtn');
const callTimerEl = document.getElementById('callTimer');

let timerInterval = null;
let callStartTime = null;

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

// TODO: replace with the real call: fetch a token from
// POST /api/token on the FastAPI backend, then join the LiveKit room.
async function connectToCall() {
    await new Promise((resolve) => setTimeout(resolve, 1500)); // placeholder delay
}

// TODO: replace with real LiveKit room.disconnect()
async function disconnectFromCall() {
    // nothing to do yet
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
        alert('Could not connect. Please try again.');
    }
}

async function handleEndCall() {
    stopTimer();
    await disconnectFromCall();
    setCallState('idle');
}

callFab.addEventListener('click', handleStartCall);
endCallBtn.addEventListener('click', handleEndCall);