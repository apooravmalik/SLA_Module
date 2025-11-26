# services/master_data_service.py (CORRECTED for PyODBC List Handling)
from sqlalchemy.orm import Session
from sqlalchemy import text
from schemas import FilterOption, MasterFiltersResponse
from typing import List, Dict, Any, Optional

DB_SCHEMA = "dbo"

def fetch_master_list(db: Session, table_name: str, id_col: str, name_col: str) -> List[Dict]:
    """Generic function to fetch ID and Name from a master table."""
    query_sql = f"SELECT {id_col} AS id, {name_col} AS name FROM {DB_SCHEMA}.{table_name}"
    result = db.execute(text(query_sql)).mappings().all()
    return [dict(row) for row in result]


def get_cascading_filters(
    db: Session, 
    zone_ids: Optional[List[int]] = None, 
    street_ids: Optional[List[int]] = None
) -> MasterFiltersResponse:
    """
    Fetches filtered lists of Streets and Units based on selected parent IDs.
    Uses dynamic query construction to resolve PyODBC's list binding error.
    """
    
    # 1. Fetch ALL Zones (Always the top-level list)
    zone_list = fetch_master_list(db, "CameraZone_TBL", "CameraZone_PRK", "cznName_TXT")
    
    # --- Determine filter parameters for dynamic query building ---
    
    # SQLAlchemy requires an empty list to be replaced by a non-existent ID or an "always true" clause.
    # The simplest is to check if the list is empty and use a fallback value.
    zone_filter_params = {}
    street_filter_params = {}
    
    # Set default WHERE clause parts if no IDs are provided
    zone_where = "1=1" # Always true if no zones are selected
    street_where = "1=1"
    
    
    # 2. Filter Streets by Zone (LinkStreetZone_TBL)
    if zone_ids and len(zone_ids) > 0:
        # Create parameter placeholders like :id_0, :id_1, ...
        zone_param_names = [f"zone_id_{i}" for i in range(len(zone_ids))]
        
        # Map values to parameter names
        for name, value in zip(zone_param_names, zone_ids):
            zone_filter_params[name] = value
            
        # Create SQL IN clause: lszZone_FRK IN (:zone_id_0, :zone_id_1, ...)
        zone_where = f"lsz.lszZone_FRK IN ({', '.join(':' + name for name in zone_param_names)})"

        # Execute query with dynamic WHERE clause and expanded parameters
        street_query = text(f"""
            SELECT DISTINCT
                s.Street_PRK AS id,
                s.strName_TXT AS name
            FROM {DB_SCHEMA}.Street_TBL s
            JOIN {DB_SCHEMA}.LinkStreetZone_TBL lsz ON lsz.lszStreet_FRK = s.Street_PRK
            WHERE {zone_where};
        """)
        street_results = db.execute(street_query, zone_filter_params).mappings().all()
        street_list = [dict(row) for row in street_results]
    else:
        # If no zone selected, return all streets
        street_list = fetch_master_list(db, "Street_TBL", "Street_PRK", "strName_TXT")


    # 3. Filter Units by Street (Hierarchical Join)
    if street_ids and len(street_ids) > 0:
        # Create parameter placeholders like :street_id_0, :street_id_1, ...
        street_param_names = [f"street_id_{i}" for i in range(len(street_ids))]
        
        # Map values to parameter names
        for name, value in zip(street_param_names, street_ids):
            street_filter_params[name] = value
            
        # Create SQL IN clause: lbsStreet_FRK IN (:street_id_0, :street_id_1, ...)
        street_where = f"lbs.lbsStreet_FRK IN ({', '.join(':' + name for name in street_param_names)})"
        
        # Execute query with dynamic WHERE clause and expanded parameters
        unit_query = text(f"""
            SELECT DISTINCT
                u.Unit_PRK AS id,
                u.untUnitName_TXT AS name
            FROM {DB_SCHEMA}.Unit_TBL u
            JOIN {DB_SCHEMA}.LinkUnitBuilding_TBL lub ON lub.lubUnit_FRK = u.Unit_PRK
            JOIN {DB_SCHEMA}.LinkBuildingStreet_TBL lbs ON lbs.lbsBuilding_FRK = lub.lubBuilding_FRK
            WHERE {street_where};
        """)
        unit_results = db.execute(unit_query, street_filter_params).mappings().all()
        unit_list = [dict(row) for row in unit_results]
    else:
        # If no street selected, return all units
        unit_list = fetch_master_list(db, "Unit_TBL", "Unit_PRK", "untUnitName_TXT")


    return MasterFiltersResponse(
        zones=[FilterOption(**item) for item in zone_list],
        streets=[FilterOption(**item) for item in street_list],
        units=[FilterOption(**item) for item in unit_list],
    )