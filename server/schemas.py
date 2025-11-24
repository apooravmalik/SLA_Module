# schemas.py
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from decimal import Decimal

# --- Base Schema for Creating New Users (Used by Admin/Management) ---
class UserCreate(BaseModel):
    """Schema for creating a new user."""
    username: str = Field(..., min_length=3, max_length=50, alias='sluUsername_TXT')
    password: str = Field(..., min_length=8)
    role: str = Field(..., alias='sluRole_TXT', pattern='^(Management|Admin|User)$')


# --- Schema for User Authentication (Login Request) ---
class UserLogin(BaseModel):
    """Schema for user login request."""
    username: str
    password: str


# --- Schema for Token Response ---
class Token(BaseModel):
    """Schema for JWT token response."""
    access_token: str
    token_type: str = "bearer"


# --- Schema for User Data Response (After Successful Login or Fetch) ---
class UserResponse(BaseModel):
    """Schema for presenting user data back to the client."""
    sluUserID_PRK: int
    sluUsername_TXT: str
    sluRole_TXT: str
    sluLastLoggedIn_DTM: Optional[datetime]
    
    class Config:
        # Allows Pydantic to work with SQLAlchemy models (ORM mode)
        from_attributes = True
        
        
# --- Request Schema for Dashboard Filters ---
class DashboardFilters(BaseModel):
    """Filters applied to the dashboard queries."""
    zone_id: Optional[int] = None
    street_id: Optional[int] = None
    unit_id: Optional[int] = None
    date_from: Optional[datetime] = None  # Calendar/Date Filter Start
    date_to: Optional[datetime] = None    # Calendar/Date Filter End

# --- Response Schemas for Dashboard KPIs ---
class DashboardKPIs(BaseModel):
    """Unified response structure for all dashboard metrics."""
    # Static KPIs (Usually unfiltered, quick lookups)
    total_zones: int
    total_streets: int
    total_units: int
    
    # Dynamic KPIs (Filtered and potentially calculated)
    total_open_incidents: int
    total_closed_incidents: int
    total_penalty: Decimal = Field(..., description="Calculated SLA Penalty for the period.")

    # Graceful error handling structure
    error_details: dict[str, str] = Field(default={}, description="Errors encountered during KPI calculation.")

    class Config:
        from_attributes = True
        json_encoders = {Decimal: lambda v: str(v)}