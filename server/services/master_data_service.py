# services/master_data_service.py (CORRECTED with proper Link table joins)
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
    Fetches filtered lists of Streets and Units based on selected parent IDs.
    Uses the correct LinkCameraZone → LinkStreetZone → LinkBuildingStreet → LinkUnitBuilding path.
    """
    
    # 1. Fetch ALL Zones (Always the top-level list - unfiltered)
    zone_list = fetch_master_list(db, "CameraZone_TBL", "CameraZone_PRK", "cznName_TXT")
    
    
    # ===================================================================
    # 2. Filter Streets by Selected Zone(s)
    # ===================================================================
    if zone_ids and len(zone_ids) > 0:
        # Build dynamic IN clause for zones
        zone_param_names = [f"zone_id_{i}" for i in range(len(zone_ids))]
        zone_filter_params = {name: value for name, value in zip(zone_param_names, zone_ids)}
        zone_where = f"lczZone_FRK IN ({', '.join(':' + name for name in zone_param_names)})"
        
        # Query using the correct Link table path: LinkCameraZone → LinkStreetZone
        street_query = text(f"""
            SELECT DISTINCT
                s.Street_PRK AS id,
                s.strName_TXT AS name
            FROM {DB_SCHEMA}.Street_TBL s
            JOIN {DB_SCHEMA}.LinkStreetZone_TBL lsz ON lsz.lszStreet_FRK = s.Street_PRK
            JOIN {DB_SCHEMA}.LinkCameraZone_TBL lcz ON lcz.lczZone_FRK = lsz.lszZone_FRK
            WHERE {zone_where}
            ORDER BY s.strName_TXT;
        """)
        
        street_results = db.execute(street_query, zone_filter_params).mappings().all()
        street_list = [dict(row) for row in street_results]
        
    else:
        # No zone filter → return all streets
        street_list = fetch_master_list(db, "Street_TBL", "Street_PRK", "strName_TXT")


    # ===================================================================
    # 3. Filter Units by Selected Street(s)
    # ===================================================================
    if street_ids and len(street_ids) > 0:
        # Build dynamic IN clause for streets
        street_param_names = [f"street_id_{i}" for i in range(len(street_ids))]
        street_filter_params = {name: value for name, value in zip(street_param_names, street_ids)}
        street_where = f"lbsStreet_FRK IN ({', '.join(':' + name for name in street_param_names)})"
        
        # Query using the correct Link table path: LinkBuildingStreet → LinkUnitBuilding
        unit_query = text(f"""
            SELECT DISTINCT
                u.Unit_PRK AS id,
                u.untUnitName_TXT AS name
            FROM {DB_SCHEMA}.Unit_TBL u
            JOIN {DB_SCHEMA}.LinkUnitBuilding_TBL lub ON lub.lubUnit_FRK = u.Unit_PRK
            JOIN {DB_SCHEMA}.LinkBuildingStreet_TBL lbs ON lbs.lbsBuilding_FRK = lub.lubBuilding_FRK
            WHERE {street_where}
            ORDER BY u.untUnitName_TXT;
        """)
        
        unit_results = db.execute(unit_query, street_filter_params).mappings().all()
        unit_list = [dict(row) for row in unit_results]
        
    else:
        # No street filter → return all units
        unit_list = fetch_master_list(db, "Unit_TBL", "Unit_PRK", "untUnitName_TXT")


    # ===================================================================
    # Return the cascaded filter options
    # ===================================================================
    return MasterFiltersResponse(
        zones=[FilterOption(**item) for item in zone_list],
        streets=[FilterOption(**item) for item in street_list],
        units=[FilterOption(**item) for item in unit_list],
    )