from fastapi.security import HTTPBearer
import jwt
from fastapi import Depends, HTTPException
from config import LOGIN_EMAIL, SECRET_KEY, ALGORITHM


from logger_s import get_logger

logger = get_logger(__name__)

security = HTTPBearer()


def secure_route(guard=Depends(security)):
    try:
        decode_token = jwt.decode(
            guard.credentials,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"require": ["exp"]})
        logger.info("Successfully decoded token")
    except jwt.PyJWTError as e:
        logger.error(f"Invalid Token: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid Token",
            headers={"WWW-Authenticate": "Bearer"})

    if decode_token.get("sub") != LOGIN_EMAIL:
        logger.error("Invalid Token")
        raise HTTPException(
            status_code=401,
            detail="Invalid Token",
            headers={"WWW-Authenticate": "Bearer"})
    else:
        logger.info("User email matches system email")
        return decode_token
