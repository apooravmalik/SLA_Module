# services/auth.py
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import update, select
from fastapi import HTTPException, status
from typing import Optional

from models import SLAUser, SLAAuthLog
from security.security import verify_password, create_access_token
from config.config import settings

def authenticate_user(db: Session, username: str, password: str) -> Optional[SLAUser]:
    """
    Finds a user by username and verifies the password.
    Returns the SLAUser object on success, or None on failure.
    """
    user = db.query(SLAUser).filter(
        SLAUser.sluUsername_TXT == username
    ).first()

    if not user or not verify_password(password, user.sluPasswordHash_TXT):
        # Log failed attempt if user is found, or log an anonymous failure otherwise
        log_failed_login(db, user.sluUserID_PRK if user else None, username)
        return None
    
    return user

def create_user_token(user: SLAUser) -> str:
    """
    Generates a JWT token for a successfully authenticated user.
    """
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # Subject ('sub') is the username; 'role' is included for authorization checks later
    access_token = create_access_token(
        data={"sub": user.sluUsername_TXT, "role": user.sluRole_TXT},
        expires_delta=access_token_expires
    )
    return access_token

def log_successful_login(db: Session, user_id: int, username: str):
    """Logs a successful 'Login' event and updates the user's last login time."""
    
    # 1. Log the event
    new_log = SLAAuthLog(
        slaUserID_FRK=user_id,
        slaUsername_TXT=username,
        slaActionType_TXT='Login',
        slaTimestamp_DTM=datetime.now(timezone.utc),
        slaSuccess_BLN=True,
        slaIPAddress_TXT='127.0.0.1' # To be updated with request details later
    )
    db.add(new_log)
    
    # 2. Update Last Logged In Timestamp
    stmt = (
        update(SLAUser)
        .where(SLAUser.sluUserID_PRK == user_id)
        .values(sluLastLoggedIn_DTM=datetime.now(timezone.utc))
    )
    db.execute(stmt)
    
    db.commit()

def log_failed_login(db: Session, user_id: Optional[int], username: str):
    """Logs a 'Failed' login attempt."""
    new_log = SLAAuthLog(
        slaUserID_FRK=user_id if user_id else 0, # Use 0 or NULL if user not found
        slaUsername_TXT=username,
        slaActionType_TXT='Failed',
        slaTimestamp_DTM=datetime.now(timezone.utc),
        slaSuccess_BLN=False,
        slaIPAddress_TXT='127.0.0.1' 
    )
    db.add(new_log)
    db.commit()

def log_logout_event(db: Session, username: str):
    """Logs a 'Logout' event and determines the UserID."""
    
    # 1. Find the UserID from the username in the token payload
    # NOTE: It's safer to find the user ID from the username provided in the token payload
    user_id_result = db.execute(
        select(SLAUser.sluUserID_PRK)
        .where(SLAUser.sluUsername_TXT == username)
    ).scalar_one_or_none()

    user_id = user_id_result if user_id_result is not None else 0
    
    # 2. Log the event
    new_log = SLAAuthLog(
        slaUserID_FRK=user_id,
        slaUsername_TXT=username,
        slaActionType_TXT='Logout',
        slaTimestamp_DTM=datetime.now(timezone.utc),
        slaSuccess_BLN=True,
        slaIPAddress_TXT='127.0.0.1' # To be updated with request details later
    )
    db.add(new_log)
    db.commit()