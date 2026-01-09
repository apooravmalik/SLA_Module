# services/master_data_service.py (CORRECTED with proper Link table joins)
from sqlalchemy.orm import Session
from sqlalchemy import text
from schemas import FilterOption, MasterFiltersResponse, ZoneDetail, ZoneListResponse, StreetDetail, StreetListResponse, UnitDetail, UnitListResponse, IncidentDetail, IncidentListResponse
from typing import List, Dict, Any, Optional
from datetime import datetime
import re # <-- ADDED for substitute_params
from decimal import Decimal 

DB_SCHEMA = "dbo"

# ---------------------------------------------------------------
# Helper: Substitute parameters into SQL for debugging 
# (Copied from other services to enable local query printing)
# ---------------------------------------------------------------
def substitute_params(query: str, params: dict) -> str:
    def replacer(match):
        key = match.group(1)
        value = params.get(key)

        if value is None:
            return "NULL"

        if isinstance(value, datetime):
            return f"'{value.strftime('%Y-%m-%d %H:%M:%S')}'"
        if isinstance(value, (int, float, Decimal)):
            return str(value)

        # Treat strings (like zone_list) with quotes
        return f"'{value}'" 

    # Use re.sub to replace named parameters like :zone_list
    return re.sub(r':(\b\w+\b)', replacer, query)
# ---------------------------------------------------------------

def fetch_master_list(db: Session, table_name: str, id_col: str, name_col: str) -> List[Dict]:
    """Generic function to fetch DISTINCT ID and Name from a master table."""
    # FIX: Added DISTINCT to ensure unique combinations of ID and Name
    query_sql = f"SELECT DISTINCT {id_col} AS id, {name_col} AS name FROM {DB_SCHEMA}.{table_name} ORDER BY {name_col}"
    result = db.execute(text(query_sql)).mappings().all()
    return [dict(row) for row in result]

def get_cascading_filters(
    db: Session, 
    # Parameters are accepted but ignored for the dropdown logic
    zone_ids: Optional[List[int]] = None, 
    street_ids: Optional[List[int]] = None
) -> MasterFiltersResponse:
    """
    Fetches UNFILTERED lists of Zones, Streets, and Units for the Navbar dropdowns.
    (Cascading logic is intentionally removed per requirement).
    """
    
    # 1. Fetch ALL Zones 
    zone_list = fetch_master_list(db, "CameraZone_TBL", "CameraZone_PRK", "cznName_TXT")
        
    # 2. Fetch ALL Streets (No Filtering)
    street_list = fetch_master_list(db, "Street_TBL", "Street_PRK", "strName_TXT")

    # 3. Fetch ALL Units (No Filtering)
    unit_list = fetch_master_list(db, "Unit_TBL", "Unit_PRK", "untUnitName_TXT")


    # ===================================================================
    # Return the master filter options
    # ===================================================================
    return MasterFiltersResponse(
        zones=[FilterOption(**item) for item in zone_list],
        streets=[FilterOption(**item) for item in street_list],
        units=[FilterOption(**item) for item in unit_list],
    )
    
# ----------------------------------------------------------------------
# NEW: Functions for Detailed Static Master Data Retrieval
# ----------------------------------------------------------------------
def get_zone_details(db: Session) -> ZoneListResponse:
    """Retrieves all Zone data: select CameraZone_PRK, cznName_TXT from CameraZone_TBL"""
    query = text(f"""
        SELECT 
            CameraZone_PRK, 
            cznName_TXT 
        FROM {DB_SCHEMA}.CameraZone_TBL
        ORDER BY cznName_TXT;
    """)
    
    rows = db.execute(query).mappings().all()
    data = [ZoneDetail(**dict(r)) for r in rows]
    return ZoneListResponse(total_count=len(data), data=data)


def get_street_details(db: Session) -> StreetListResponse:
    """Retrieves all Street data with linked Zone information (as requested)."""
    query = text(f"""
        SELECT 
            s.Street_PRK,
            s.strName_TXT AS StreetName,
            s.strDescription_MEM,
            s.strPostCode_TXT,
            cz.cznName_TXT AS ZoneName
        FROM {DB_SCHEMA}.Street_TBL s
        LEFT JOIN {DB_SCHEMA}.LinkStreetZone_TBL lsz
            ON s.Street_PRK = lsz.lszStreet_FRK
        LEFT JOIN {DB_SCHEMA}.CameraZone_TBL cz
            ON lsz.lszZone_FRK = cz.CameraZone_PRK
        ORDER BY s.strName_TXT;
    """)
    
    rows = db.execute(query).mappings().all()
    data = [StreetDetail(**dict(r)) for r in rows]
    return StreetListResponse(total_count=len(data), data=data)


def get_unit_details(db: Session) -> UnitListResponse:
    """Retrieves all Unit data: Select * from Unit_TBL"""
    # Mapping to UnitDetail schema for predictable columns
    query = text(f"""
        SELECT 
            Unit_PRK,
            untUnitName_TXT, 
            untOtherInfo_MEM 
        FROM Unit_TBL
        ORDER BY untUnitName_TXT;
    """)
    
    rows = db.execute(query).mappings().all()
    data = [UnitDetail(**dict(r)) for r in rows]
    return UnitListResponse(total_count=len(data), data=data)


def get_incident_details(
    db: Session, 
    zone_ids: Optional[List[int]] = None, 
    street_ids: Optional[List[int]] = None,
    unit_ids: Optional[List[int]] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    status_filter: Optional[int] = None,
    skip: int = 0, # NEW
    limit: int = 500, # NEW
) -> IncidentListResponse:
    """
    Retrieves detailed incident data based on dashboard filters and status (PAGINATED).
    """
    
    # 1. Prepare parameters for string splitting
    zone_list = ",".join(str(z) for z in zone_ids) if zone_ids else None
    street_list = ",".join(str(s) for s in street_ids) if street_ids else None
    unit_list = ",".join(str(u) for u in unit_ids) if unit_ids else None
    
    # Base parameters for all queries
    base_params = {
        "zone_list": zone_list,
        "street_list": street_list,
        "unit_list": unit_list,
        "date_from": date_from,
        "date_to": date_to,
        "status_filter": status_filter,
    }

    # 2. Base WHERE clause (shared by COUNT and DATA queries)
    where_clause = f"""
        WHERE 1 = 1
        /** Zone Filtering **/
        AND (COALESCE(:zone_list, '') IS NULL OR COALESCE(:zone_list, '') = '' 
            OR il.inlZone_FRK IN (SELECT TRIM([value]) FROM STRING_SPLIT(:zone_list, ',')))

        /** Street Filtering **/
        AND (COALESCE(:street_list, '') IS NULL OR COALESCE(:street_list, '') = '' 
            OR il.inlStreet_FRK IN (SELECT TRIM([value]) FROM STRING_SPLIT(:street_list, ',')))

        /** Unit Filtering **/
        AND (COALESCE(:unit_list, '') IS NULL OR COALESCE(:unit_list, '') = '' 
            OR il.inlUnit_FRK IN (SELECT TRIM([value]) FROM STRING_SPLIT(:unit_list, ',')))

        /** Date Filtering **/
        AND (:date_from IS NULL OR il.inlDateTime_DTM >= :date_from)
        AND (:date_to IS NULL OR il.inlDateTime_DTM <= :date_to)

        /** Status Filtering (Open/Closed) **/
        AND (:status_filter IS NULL OR il.inlStatus_FRK = :status_filter)
    """

    # 3. Base SELECT statement (for both COUNT and DATA queries)
    select_join_clause = f"""
        FROM {DB_SCHEMA}.IncidentLog_TBL il
        LEFT JOIN {DB_SCHEMA}.IncidentCategory_TBL cat 
            ON il.inlCategory_FRK = cat.IncidentCategory_PRK
        LEFT JOIN {DB_SCHEMA}.IncidentStatus_TBL st
            ON il.inlStatus_FRK = st.IncidentStatus_PRK
        LEFT JOIN {DB_SCHEMA}.CameraZone_TBL cz
            ON il.inlZone_FRK = cz.CameraZone_PRK
        LEFT JOIN {DB_SCHEMA}.Street_TBL s
            ON il.inlStreet_FRK = s.Street_PRK
        LEFT JOIN {DB_SCHEMA}.Unit_TBL u
            ON il.inlUnit_FRK = u.Unit_PRK
    """
    
    # 4. Total Count Query
    count_query = text(f"SELECT COUNT(*) {select_join_clause} {where_clause}")

    # 5. Data Fetch Query (PAGINATED)
    data_query = text(f"""
        SELECT 
            il.IncidentLog_PRK,
            il.inlIncidentDetails_MEM,
            il.inlDateTime_DTM,

            il.inlCategory_FRK,
            cat.incName_TXT AS CategoryName,

            il.inlStatus_FRK,
            st.insName_TXT AS StatusName,

            il.inlZone_FRK,
            cz.cznName_TXT AS ZoneName,

            il.inlStreet_FRK,
            s.strName_TXT AS StreetName,

            il.inlUnit_FRK,
            u.untUnitName_TXT AS UnitName,
            u.untOtherInfo_MEM AS UnitDetails

        {select_join_clause}
        {where_clause}
        ORDER BY il.IncidentLog_PRK DESC
        OFFSET :skip ROWS
        FETCH NEXT :limit ROWS ONLY;
    """)

    # Combine params and add pagination parameters
    data_params = {**base_params, "skip": skip, "limit": limit}
    count_params = base_params

    # 6. Execute and map
    try:
        # Execute COUNT query first
        total_rows_result = db.execute(count_query, count_params).scalar_one()
        total_count = int(total_rows_result) if total_rows_result is not None else 0

        # Execute DATA query
        rows = db.execute(data_query, data_params).mappings().all()
        data = [IncidentDetail(**dict(r)) for r in rows]
        
        return IncidentListResponse(total_count=total_count, data=data)
    except Exception as e:
        print(f"❌ ERROR EXECUTING PAGINATED INCIDENT DETAIL QUERY: {e}")
        return IncidentListResponse(total_count=0, data=[])