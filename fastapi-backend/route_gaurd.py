from fastapi.security import HTTPBearer
import jwt
from fastapi import Depends, HTTPException
from config import LOGIN_EMAIL, SECRET_KEY, ALGORITHM
from logger_s import get_logger

logger = get_logger(__name__)

security = HTTPBearer()


class TokenCheckError(Exception):
    "used in secure token"


def verify_token(token):
    if not isinstance(token, str) or not token.strip():
        raise TokenCheckError("missing token")
    else:
        try:
            decode_token = jwt.decode(
                token,
                SECRET_KEY,
                algorithms=[ALGORITHM],
                options={"require": ["exp"]})
            logger.info("Successfully decoded normal token")
        except jwt.PyJWTError as e:
            logger.error(f"Invalid Token: {e}")
            raise TokenCheckError("Invalid token")
    if decode_token.get("sub") != LOGIN_EMAIL:
        logger.error("Invalid Email")
        raise TokenCheckError("Invalid token")

    else:
        logger.info("successfully matched email")
        return decode_token


def secure_route(guard=Depends(security)):
    try:
        return verify_token(guard.credentials)
    except TokenCheckError as e:
        logger.error(f"Invalid Token: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid Token",
            headers={"WWW-Authenticate": "Bearer"})
