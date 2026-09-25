from dotenv import load_dotenv
from upstash_redis.asyncio.client import Redis

load_dotenv()

redis = Redis.from_env()
