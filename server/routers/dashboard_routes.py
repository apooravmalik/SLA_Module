# routers/dashboard_routers.py
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from datetime import datetime

# Local Imports
from database import get_db
from schemas import DashboardKPIs, DashboardFilters
from services import dashboard_service

# Define the router
router = APIRouter(
    prefix="/api/dashboard",
    tags=["Dashboard"]
)

@router.get("/", response_model=DashboardKPIs, status_code=status.HTTP_200_OK)
async def get_dashboard_kpis(
    db: Session = Depends(get_db),
    
    # --- Query Parameters (Filters from Sketch) ---
    zone_id: Optional[int] = Query(None, description="Filter by specific Zone ID (inlZone_FRK)."),
    street_id: Optional[int] = Query(None, description="Filter by specific Street ID (inlStreet_FRK)."),
    unit_id: Optional[int] = Query(None, description="Filter by specific Unit ID (inlUnit_FRK)."),
    date_from: Optional[datetime] = Query(None, description="Filter incidents from this date/time (Calendar Start)."),
    date_to: Optional[datetime] = Query(None, description="Filter incidents up to this date/time (Calendar End).")
):
    """
    Retrieves all dashboard KPIs (Zone counts, Incidents, Penalty) 
    using filters and executing calculations concurrently in the service layer.
    """
    
    # 1. Map query parameters to the Pydantic Filter Schema
    filters = DashboardFilters(
        zone_id=zone_id,
        street_id=street_id,
        unit_id=unit_id,
        date_from=date_from,
        date_to=date_to,
    )
    
    # 2. Call the service to get the parallelized and calculated data
    kpi_data = await dashboard_service.get_dashboard_data(db, filters)
    
    return kpi_data