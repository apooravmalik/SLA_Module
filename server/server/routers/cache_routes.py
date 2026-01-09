from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional

from database import get_db
from schemas import PenaltyWaiverRequest
from services import cache_data_service

router = APIRouter(
    prefix="/api/cache",
    tags=["Cache Management"]
)

@router.post("/waive_penalty", status_code=status.HTTP_200_OK)
def waive_penalty(
    request: PenaltyWaiverRequest,
    db: Session = Depends(get_db)
):
    """
    Updates the inlSubCategory_FRK in IncidentLog_TBL in the production database
    and then regenerates the DuckDB cache for the affected month.
    """
    try:
        cache_data_service.update_incident_log_and_refresh_cache(
            db, 
            request.incident_log_prk,
            request.subcategory_id,
            request.date_from,
            request.date_to
        )
        return {"message": f"Penalty for IncidentLog_PRK={request.incident_log_prk} waived and cache refreshed."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to waive penalty and refresh cache: {e}")

@router.post("/refresh_cache", status_code=status.HTTP_200_OK)
def refresh_cache(db: Session = Depends(get_db)):
    cache_data_service.refresh_full_cache(db)
    return {"message": "Cache refreshed successfully"}

    """
    Manually triggers a regeneration of the DuckDB cache for the specified month.
    """
    try:
        cache_data_service.regenerate_duckdb_cache(db, date_from, date_to)
        return {"message": f"Cache for {date_from.strftime('%Y-%m')} refreshed successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to refresh cache: {e}")