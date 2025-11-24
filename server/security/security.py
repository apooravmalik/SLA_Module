# security/security.py
from datetime import datetime, timedelta, timezone
from typing import Any
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from typing import Optional

# Import settings from your config file
from config.config import settings

# --- 1. Password Hashing Context ---
# The CryptContext defines the default hashing algorithm (bcrypt is highly recommended)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- 2. OAuth2 Scheme for Token Retrieval ---
# This tells FastAPI how to expect the token (in the Authorization header as "Bearer <token>")
# The "token" endpoint name is arbitrary, but required for the setup
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token") 


# --- Password Utility Functions ---

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check if the plain password matches the stored hash."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Generate a secure hash for a given password."""
    return pwd_context.hash(password)


# --- JWT Utility Functions ---

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Creates a JWT access token."""
    to_encode = data.copy()
    
    # Set expiration time
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        # Use the value from config/config.py if no delta is provided
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # Add expiry and issuer (optional) claims
    to_encode.update({"exp": expire, "iss": "SLAPenaltyModule"})
    
    # Encode the token using the secret key and algorithm from settings
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> dict[str, Any]:
    """Decodes a JWT token, raising an exception on failure or expiration."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Decode the token
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        
        # We expect 'sub' (subject, typically the user ID or username) in the payload
        # Ensure your token creation includes 'sub'
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
            
        return payload
    
    except JWTError:
        # This catches token expiration, invalid signature, etc.
        raise credentials_exception

# --- 3. Dependency for Protected Routes (Optional for now, but essential later) ---

# This function is used in any API route that requires the user to be logged in.
# It uses the `oauth2_scheme` to extract the token, then decodes it.
def get_current_user_payload(token: str = Depends(oauth2_scheme)) -> dict[str, Any]:
    """Dependency to retrieve the current user's payload from the JWT."""
    return decode_access_token(token)