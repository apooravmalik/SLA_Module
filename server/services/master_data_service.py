# services/master_data_service.py
from sqlalchemy.orm import Session
from sqlalchemy import text
from schemas import FilterOption, MasterFiltersResponse
from typing import List, Dict

DB_SCHEMA = "dbo"

def fetch_master_list(db: Session, table_name: str, id_col: str, name_col: str) -> List[Dict]:
    """Generic function to fetch ID and Name from a master table."""
    query_sql = f"SELECT {id_col} AS id, {name_col} AS name FROM {DB_SCHEMA}.{table_name}"
    
    # Execute the raw query
    result = db.execute(text(query_sql)).mappings().all()
    
    # Return a list of dictionaries [{'id': 1, 'name': 'Zone A'}, ...]
    return [dict(row) for row in result]


def get_all_master_filters(db: Session) -> MasterFiltersResponse:
    """Fetches all master filter data concurrently (synchronous for simplicity here)."""
    
    # NOTE: You'll need to confirm the exact column names (e.g., Zone_PRK, ZoneName_TXT)
    zone_list = fetch_master_list(db, "CameraZone_TBL", "CameraZone_PRK", "cznName_TXT")
    street_list = fetch_master_list(db, "Street_TBL", "Street_PRK", "strName_TXT")
    unit_list = fetch_master_list(db, "Unit_TBL", "Unit_PRK", "untUnitName_TXT")
    
    return MasterFiltersResponse(
        zones=[FilterOption(**item) for item in zone_list],
        streets=[FilterOption(**item) for item in street_list],
        units=[FilterOption(**item) for item in unit_list],
    )