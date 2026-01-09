# routers/master_data_routes.py
from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.orm import Session
from typing import Annotated, List, Optional
from datetime import datetime

# Local Imports
from database import get_db
# UPDATED IMPORT: Added new Incident response schemas
from schemas import MasterFiltersResponse, ZoneListResponse, StreetListResponse, UnitListResponse, IncidentListResponse, DashboardFilters
from services import master_data_service

router = APIRouter(
    prefix="/api/master",
    tags=["Master Data"]
)

@router.get("/filters", response_model=MasterFiltersResponse, status_code=status.HTTP_200_OK)
def get_cascading_filters_route(
    db: Session = Depends(get_db),
    
    # Accept multi-select parameters for cascading filters
    # FastAPI maps multiple query string parameters (e.g., zone_ids=3&zone_ids=4) to List[int]
    zone_ids: Optional[List[int]] = Query(None, description="Selected Zone IDs to filter streets by."),
    street_ids: Optional[List[int]] = Query(None, description="Selected Street IDs to filter units by."),
):
    """
    Retrieves all master filter data. When parent IDs are provided (e.g., zone_ids),
    it returns the corresponding filtered lists (e.g., streets), implementing the cascade.
    
    NOTE: This replaces the old get_all_master_filters function call.
    """
    
    # Call the new service function which implements the cascading logic
    return master_data_service.get_cascading_filters(
        db=db,
        zone_ids=zone_ids,
        street_ids=street_ids,
    )

# ----------------------------------------------------------------------
# STATIC KPI DETAIL DATA ROUTES
# ----------------------------------------------------------------------

@router.get("/zones", response_model=ZoneListResponse, status_code=status.HTTP_200_OK)
def get_all_zones_data(db: Session = Depends(get_db)):
    """Retrieves a detailed list of all Zones."""
    return master_data_service.get_zone_details(db)

@router.get("/streets", response_model=StreetListResponse, status_code=status.HTTP_200_OK)
def get_all_streets_data(db: Session = Depends(get_db)):
    """Retrieves a detailed list of all Streets with linked Zone data."""
    return master_data_service.get_street_details(db)

@router.get("/units", response_model=UnitListResponse, status_code=status.HTTP_200_OK)
def get_all_units_data(db: Session = Depends(get_db)):
    """Retrieves a detailed list of all Units."""
    return master_data_service.get_unit_details(db)

# ----------------------------------------------------------------------
# FIXED ROUTE for DYNAMIC KPI DETAIL DATA (Incidents) - ADDED PAGINATION
# ----------------------------------------------------------------------
@router.get("/incidents", response_model=IncidentListResponse, status_code=status.HTTP_200_OK)
def get_incident_detail_data(
    db: Session = Depends(get_db),
    # Use the same filters as the dashboard, plus an explicit status filter
    zone_id: Optional[List[int]] = Query(None),
    street_id: Optional[List[int]] = Query(None),
    unit_id: Optional[List[int]] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    status_filter: Optional[int] = Query(None, description="1 for Open, 2 for Closed."),
    # NEW PAGINATION PARAMETERS
    skip: int = Query(0, ge=0, description="The number of records to skip for pagination."),
    limit: int = Query(500, ge=1, le=1000, description="The maximum number of records to return (page size)."),
):
    """
    Retrieves detailed incident log data filtered by user selections and incident status (paginated).
    """
    
    return master_data_service.get_incident_details(
        db=db,
        zone_ids=zone_id,
        street_ids=street_id,
        unit_ids=unit_id,
        date_from=date_from,
        date_to=date_to,
        status_filter=status_filter,
        skip=skip,
        limit=limit,
    )