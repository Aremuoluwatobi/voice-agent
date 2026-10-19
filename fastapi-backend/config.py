from dotenv import load_dotenv
import os
from upstash_redis.asyncio import Redis

load_dotenv()

LIVEKIT_API_KEY = os.environ["LIVEKIT_API_KEY"]
LIVEKIT_API_SECRET = os.environ["LIVEKIT_API_SECRET"]
LIVEKIT_URL = os.environ["LIVEKIT_URL"]
redis = Redis.from_env()
LOGIN_EMAIL = os.environ["LOGIN_EMAIL"]
LOGIN_PASSWORD = os.environ["LOGIN_PASSWORD"]
SECRET_KEY = os.environ["SECRET_KEY"]
ALGORITHM = os.environ["ALGORITHM"]
EXPIRE_TIME = int(os.environ["EXPIRE_TIME"])
FRONTEND_ORIGIN = os.environ["CORS_ALLOWED_ORIGINS"]
AUTH_TIMEOUT_SECONDS = int(os.environ["AUTH_TIMEOUT_SECONDS"])
MAX_MESSAGE_CHARS = int(os.environ["MAX_MESSAGE_CHARS"])
POLICY_VIOLATION = int(os.environ["POLICY_VIOLATION"])
CALL_LOCK_KEY = os.environ["CALL_LOCK_KEY"]
LOCK_TIMEOUT_SECONDS = int(os.environ["LOCK_TIMEOUT_SECONDS"])
HEARTBEAT_TIMEOUT_SECONDS = int(os.environ["HEARTBEAT_TIMEOUT_SECONDS"])
RATE_LIMIT_MESSAGES = int(os.environ["RATE_LIMIT_MESSAGES"])
RATE_LIMIT_WINDOW_SECONDS = int(os.environ["RATE_LIMIT_WINDOW_SECONDS"])
HANDOFF_SECRET = os.environ["HANDOFF_SECRET"]
HANDOFF_TIMEOUT_SECONDS = int(os.environ["HANDOFF_TIMEOUT_SECONDS"])
