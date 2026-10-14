from fastapi import APIRouter, HTTPException, Depends
from config import LOGIN_PASSWORD, LOGIN_EMAIL, EXPIRE_TIME, ALGORITHM, SECRET_KEY
import secrets
import jwt
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from route_gaurd import secure_route
from logger_s import get_logger

router = APIRouter()

logger = get_logger(__name__)


class AuthRequest(BaseModel):
    email: str
    password: str


@router.post("/agent/login")
def agent_login(login_info: AuthRequest):
    # strip white spacing and owner text
    strip_lower_email = login_info.email.strip().lower()
    # check for empty string
    if not strip_lower_email or not login_info.password:
        raise HTTPException(
            status_code=400, detail="Email and password needed")
    # encode user password and email due to secrets.compare_digest()
    encode_user_email = strip_lower_email.encode("utf-8")
    encode_user_password = login_info.password.encode("utf-8")
    # encode system password and email due to secrets.compare_digest()
    encode_system_password = LOGIN_PASSWORD.encode("utf-8")
    encode_system_email = LOGIN_EMAIL.encode("utf-8")
    # check user email against system email
    checked_email = secrets.compare_digest(
        encode_user_email, encode_system_email)
    # check user password against system password
    checked_password = secrets.compare_digest(
        encode_user_password, encode_system_password)

    if checked_email and checked_password:
        logger.info(f"Successfully logged in")
        expired_time = datetime.now(
            timezone.utc) + timedelta(minutes=EXPIRE_TIME)

        token_payload = {
            "sub": strip_lower_email,
            "exp": expired_time.timestamp()
        }

        token_room_access = jwt.encode(
            token_payload, SECRET_KEY, algorithm=ALGORITHM)

        return {"status": "successful", "token": token_room_access}
    else:
        logger.error("Failed log in")
        raise HTTPException(
            status_code=401, detail="Email or Password is wrong")


@router.get("/agent/dashboard")
def Get_agent_dashboard(guard=Depends(secure_route)):
    return {"hi": guard}
