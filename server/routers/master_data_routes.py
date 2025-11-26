# routers/master_data_routes.py
from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.orm import Session
from typing import Annotated, List, Optional

# Local Imports
from database import get_db
from schemas import MasterFiltersResponse
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