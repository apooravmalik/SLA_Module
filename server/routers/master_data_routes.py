# routers/master_data_routes.py
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import Annotated

from database import get_db
from schemas import MasterFiltersResponse
from services import master_data_service

router = APIRouter(
    prefix="/api/master",
    tags=["Master Data"]
)

@router.get("/filters", response_model=MasterFiltersResponse, status_code=status.HTTP_200_OK)
def get_master_filters(
    db: Session = Depends(get_db)
):
    """Retrieves all data needed to populate dashboard filter dropdowns."""
    return master_data_service.get_all_master_filters(db)