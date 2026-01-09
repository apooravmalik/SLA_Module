# schemas.py
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List
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
    # CHANGED TO List[int] for multi-select
    zone_id: Optional[List[int]] = None
    street_id: Optional[List[int]] = None
    unit_id: Optional[List[int]] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    skip: Optional[int] = 0
    limit: Optional[int] = 500

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
    
    rows: list = Field(default_factory=list)
    error_details: dict[str, str] = Field(default_factory=dict)

    class Config:
        from_attributes = True
        json_encoders = {Decimal: lambda v: str(v)}
        
class FilterOption(BaseModel):
    """Schema for an individual dropdown option."""
    id: int = Field(..., description="The Foreign Key (ID) used for filtering.")
    name: str = Field(..., description="The display name for the user.")

class MasterFiltersResponse(BaseModel):
    """Unified response containing all master lookup data."""
    zones: List[FilterOption]
    streets: List[FilterOption]
    units: List[FilterOption]
    
class ReportRow(BaseModel):
    # Map SQL columns to Pydantic attributes
    NVR_PRK: int
    nvrAlias_TXT: Optional[str] = None
    nvrIPAddress_TXT: Optional[str] = None
    Camera_PRK: int
    camName_TXT: Optional[str] = None
    gclZone_FRK: Optional[int] = None
    ZoneName: Optional[str] = None
    gclStreet_FRK: Optional[int] = None
    StreetName: Optional[str] = None
    gclBuilding_FRK: Optional[int] = None
    BuildingName: Optional[str] = None
    gclUnit_FRK: Optional[int] = None
    UnitName: Optional[str] = None
    OfflineTime: Optional[datetime] = None
    OnlineTime: Optional[datetime] = None
    OfflineMinutes: Optional[int] = None
    Status: Optional[str] = None
    PenaltyAmount: Decimal = Field(..., description="Penalty amount calculated for downtime.")
    IncidentLog_PRK: Optional[int] = None
    WaiverCategory: Optional[str] = None

class ReportResponse(BaseModel):
    total_rows: int
    data: list[ReportRow]
    
# Schema for Penalty Waiver Request
class PenaltyWaiverRequest(BaseModel):
    date_from: datetime
    date_to: datetime
    incident_log_prk: int
    subcategory_id: int

class IncidentDetail(BaseModel):
    IncidentLog_PRK: int
    inlIncidentDetails_MEM: Optional[str] = None
    inlDateTime_DTM: datetime
    inlCategory_FRK: Optional[int] = None
    CategoryName: Optional[str] = None
    inlStatus_FRK: Optional[int] = None
    StatusName: Optional[str] = None
    inlZone_FRK: Optional[int] = None
    ZoneName: Optional[str] = None
    inlStreet_FRK: Optional[int] = None
    StreetName: Optional[str] = None
    inlUnit_FRK: Optional[int] = None
    UnitName: Optional[str] = None
    UnitDetails: Optional[str] = None # Corresponds to untOtherInfo_MEM alias

class IncidentListResponse(BaseModel):
    total_count: int
    data: List[IncidentDetail]    
    
# Schema for Zone Data (Total Zones KPI)
class ZoneDetail(BaseModel):
    CameraZone_PRK: int
    cznName_TXT: str

class ZoneListResponse(BaseModel):
    total_count: int
    data: List[ZoneDetail]

# Schema for Street Data (Total Streets KPI)
class StreetDetail(BaseModel):
    Street_PRK: int
    StreetName: str
    strDescription_MEM: Optional[str] = None
    strPostCode_TXT: Optional[str] = None
    ZoneName: Optional[str] = None # Name of the linked zone (can be null if no link or multiple zones)

class StreetListResponse(BaseModel):
    total_count: int
    data: List[StreetDetail]

# Schema for Unit Data (Total Units KPI)
class UnitDetail(BaseModel):
    Unit_PRK: int
    untUnitName_TXT: Optional[str] = None
    untBuilding_FRK: Optional[int] = None
    untStreet_FRK: Optional[int] = None
    untZone_FRK: Optional[int] = None
    untDescription_MEM: Optional[str] = None
    
class UnitListResponse(BaseModel):
    total_count: int
    data: List[UnitDetail]