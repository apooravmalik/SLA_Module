# services/master_data_service.py
from sqlalchemy.orm import Session
from sqlalchemy import text
from schemas import FilterOption, MasterFiltersResponse
from typing import List, Dict, Any, Optional

DB_SCHEMA = "dbo"

def fetch_master_list(db: Session, table_name: str, id_col: str, name_col: str) -> List[Dict]:
    """Generic function to fetch DISTINCT ID and Name from a master table."""
    # FIX: Added DISTINCT to ensure unique combinations of ID and Name
    query_sql = f"SELECT DISTINCT {id_col} AS id, {name_col} AS name FROM {DB_SCHEMA}.{table_name} ORDER BY {name_col}"
    result = db.execute(text(query_sql)).mappings().all()
    return [dict(row) for row in result]


def get_cascading_filters(
    db: Session, 
    # These parameters are now accepted but ignored to maintain API signature
    zone_ids: Optional[List[int]] = None, 
    street_ids: Optional[List[int]] = None
) -> MasterFiltersResponse:
    """
    Fetches independent, unfiltered lists of Zones, Streets, and Units.
    The cascading functionality is removed.
    """
    
    # 1. Fetch ALL Zones (Unfiltered)
    zone_list = fetch_master_list(db, "CameraZone_TBL", "CameraZone_PRK", "cznName_TXT")
    
    
    # 2. Fetch ALL Streets (Unfiltered)
    street_list = fetch_master_list(db, "Street_TBL", "Street_PRK", "strName_TXT")


    # 3. Fetch ALL Units (Unfiltered)
    unit_list = fetch_master_list(db, "Unit_TBL", "Unit_PRK", "untUnitName_TXT")


    # ===================================================================
    # Return the three independent filter options
    # ===================================================================
    return MasterFiltersResponse(
        zones=[FilterOption(**item) for item in zone_list],
        streets=[FilterOption(**item) for item in street_list],
        units=[FilterOption(**item) for item in unit_list],
    )