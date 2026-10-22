import os

from dotenv import load_dotenv
from upstash_redis.asyncio.client import Redis

# Load .env.local BEFORE anything reads the environment.
# On LiveKit Cloud the secrets are already environment variables, so this
# only matters when running locally.
load_dotenv(".env.local")

redis = Redis.from_env()

# ---------- Call lock ----------
# Must be exactly the same key as CALL_LOCK_KEY on Render (backend).
CALL_LOCK_KEY = os.environ["CALL_LOCK_KEY"]

# Must match LOCK_TIMEOUT_SECONDS on Render (backend). Defaults to 60.
LOCK_TIMEOUT_SECONDS = int(os.environ["LOCK_TIMEOUT_SECONDS"])

# How often my-agent renews the lock. Must stay well below LOCK_TIMEOUT_SECONDS.
LOCK_RENEW_SECONDS = 20

# ---------- Handoff ----------
# Render backend address, no trailing slash (a LiveKit secret).
BACKEND_URL = os.environ["BACKEND_URL"].rstrip("/")

# Must be exactly the same as HANDOFF_SECRET on Render (a LiveKit secret).
HANDOFF_SECRET = os.environ["HANDOFF_SECRET"]

# 30 s in three places: dashboard popup, backend, and this wait. Must match Render.
HANDOFF_TIMEOUT_SECONDS = int(os.environ["HANDOFF_TIMEOUT_SECONDS"])

# How often we check Redis for Accept or Decline.
HANDOFF_POLL_SECONDS = 1

# How long we wait for the backend to answer the handoff request.
HANDOFF_REQUEST_TIMEOUT_SECONDS = 15

# Every human participant's name starts with this (set when the backend makes the room pass).
HUMAN_IDENTITY_PREFIX = "human-"

# After a human leaves, pause this long before checking why (End call vs a drop).
HUMAN_LEFT_CHECK_SECONDS = 3

# A dropped human gets this long to come back before the AI says goodbye.
HUMAN_DROP_WAIT_SECONDS = 30

# ---------- Call log and transcript ----------
# The call log in Redis keeps this many of the newest lines.
CALL_LOG_MAX_LINES = 1000

# The call log lives this long (one day). The time restarts at every new line.
CALL_LOG_SECONDS = 86400

# Newest lines kept in memory and sent again when the human joins or returns.
LIVE_REPLAY_LINES = 200

# Lines sent to the human's browser in one message (keeps each message small).
LIVE_BATCH_LINES = 10

# One line is cut to this many characters.
LINE_MAX_CHARS = 800

# Topic of the data messages that carry transcript lines. The dashboard checks it.
TRANSCRIPT_TOPIC = "transcript"

# ---- Safety net for the human's transcription ----

# a 1 second wait that wakes up this much late is one strike
HUMAN_STT_LAG_SECONDS = 1.5
# this many strikes in a row turn the human's transcription off
HUMAN_STT_LAG_STRIKES = 3
# this many STT errors turn it off
HUMAN_STT_ERROR_LIMIT = 3
