# routers/auth_routes.py
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

# Local Imports
from database import get_db
from schemas import Token
from services import auth as auth
from security.security import get_current_user_payload

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)

@router.post("/login", response_model=Token)
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db)
):
    """
    Handles user login via form data (username and password).
    Returns a JWT access token upon successful authentication.
    """
    
    # Use the service function to verify credentials
    user = auth.authenticate_user(db, form_data.username, form_data.password)

    if not user:
        # authenticate_user logs the failure, so we just raise the exception
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Log successful login and update timestamp via service
    auth.log_successful_login(db, user.sluUserID_PRK, user.sluUsername_TXT)

    # Create token via service
    access_token = auth.create_user_token(user)

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout", status_code=status.HTTP_200_OK)
def user_logout(
    # 1. User Identity from JWT (Dependency)
    # The token is mandatory to determine who is logging out.
    user_payload: Annotated[dict, Depends(get_current_user_payload)],
    
    # 2. Database Session (Dependency)
    db: Session = Depends(get_db),
):
    """
    Logs the user out by recording the event for audit purposes.
    The client must delete the token upon receiving this response.
    """
    username = user_payload.get("sub")
    
    if not username:
        # This shouldn't happen if get_current_user_payload worked, but serves as a safeguard.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token payload.")
        
    # Log the successful logout event via the service layer
    # Assuming 'auth' is your alias for the services/auth.py module
    auth.log_logout_event(db, username)
    
    return {"message": f"User {username} logged out successfully. Token should be deleted by client."}