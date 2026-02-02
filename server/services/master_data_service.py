# services/master_data_service.py (CORRECTED with proper Link table joins)
from sqlalchemy.orm import Session
from sqlalchemy import text
from schemas import FilterOption, MasterFiltersResponse, ZoneDetail, ZoneListResponse, StreetDetail, StreetListResponse, UnitDetail, UnitListResponse, IncidentDetail, IncidentListResponse
from typing import List, Dict, Any, Optional
from datetime import datetime
import re
from decimal import Decimal 

DB_SCHEMA = "dbo"

# ---------------------------------------------------------------
# Helper: Substitute parameters into SQL for debugging 
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

        return f"'{value}'" 

    return re.sub(r':(\b\w+\b)', replacer, query)

# ---------------------------------------------------------------

def fetch_master_list(db: Session, table_name: str, id_col: str, name_col: str) -> List[Dict]:
    """Generic function to fetch DISTINCT ID and Name from a master table."""
    query_sql = f"SELECT DISTINCT {id_col} AS id, {name_col} AS name FROM {DB_SCHEMA}.{table_name} ORDER BY {name_col}"
    result = db.execute(text(query_sql)).mappings().all()
    return [dict(row) for row in result]

def get_cascading_filters(
    db: Session, 
    zone_ids: Optional[List[int]] = None, 
    street_ids: Optional[List[int]] = None
) -> MasterFiltersResponse:
    """
    Retrieves filtered lists for dropdowns using the 'Catch-All' logic.
    - If Zone is selected -> Streets and Units are filtered.
    - If Street is selected -> Zones and Units are filtered.
    - If nothing selected -> Returns all options.
    """
    
    # 1. Prepare parameters for SQL (Convert lists to comma-separated strings)
    z_str = ",".join(str(z) for z in zone_ids) if zone_ids else None
    s_str = ",".join(str(s) for s in street_ids) if street_ids else None

    # 2. The Flexible "Catch-All" Query
    # We join all tables to the Hub (GeoRollupCameraLink_TBL) and apply the optional filters.
    sql = f"""
        SELECT DISTINCT
            Z.CameraZone_PRK AS ZoneID,
            Z.cznName_TXT    AS ZoneName,
            S.Street_PRK     AS StreetID,
            S.strName_TXT    AS StreetName,
            U.Unit_PRK       AS UnitID,
            U.untUnitName_TXT AS UnitName
        FROM {DB_SCHEMA}.GeoRollupCameraLink_TBL AS L
        INNER JOIN {DB_SCHEMA}.CameraZone_TBL AS Z ON L.gclZone_FRK = Z.CameraZone_PRK
        INNER JOIN {DB_SCHEMA}.Street_TBL AS S ON L.gclStreet_FRK = S.Street_PRK
        INNER JOIN {DB_SCHEMA}.Unit_TBL AS U ON L.gclUnit_FRK = U.Unit_PRK
        WHERE 
            1=1
            -- FILTER 1: ZONES (Optional)
            AND (:z_str IS NULL OR L.gclZone_FRK IN (SELECT value FROM STRING_SPLIT(:z_str, ',')))
            
            -- FILTER 2: STREETS (Optional)
            AND (:s_str IS NULL OR L.gclStreet_FRK IN (SELECT value FROM STRING_SPLIT(:s_str, ',')))
    """

    # 3. Execute Query
    params = {"z_str": z_str, "s_str": s_str}
    
    try:
        rows = db.execute(text(sql), params).mappings().all()
    except Exception as e:
        print(f"❌ Error executing cascading filters: {e}")
        return MasterFiltersResponse(zones=[], streets=[], units=[])

    # 4. Parse Results into Distinct Lists
    # Using dictionaries to ensure uniqueness (Set behavior)
    unique_zones = {}
    unique_streets = {}
    unique_units = {}

    for row in rows:
        unique_zones[row.ZoneID] = row.ZoneName
        unique_streets[row.StreetID] = row.StreetName
        unique_units[row.UnitID] = row.UnitName

    # 5. Sort and Format for Response
    # Helper to sort by Name
    def sort_options(item_dict):
        return sorted(
            [FilterOption(id=k, name=v) for k, v in item_dict.items()],
            key=lambda x: x.name
        )

    return MasterFiltersResponse(
        zones=sort_options(unique_zones),
        streets=sort_options(unique_streets),
        units=sort_options(unique_units),
    )
    
# ----------------------------------------------------------------------
# STATIC KPI DETAIL DATA ROUTES (Unchanged)
# ----------------------------------------------------------------------
def get_zone_details(db: Session) -> ZoneListResponse:
    query = text(f"""
        SELECT CameraZone_PRK, cznName_TXT 
        FROM {DB_SCHEMA}.CameraZone_TBL
        ORDER BY cznName_TXT;
    """)
    rows = db.execute(query).mappings().all()
    data = [ZoneDetail(**dict(r)) for r in rows]
    return ZoneListResponse(total_count=len(data), data=data)


def get_street_details(db: Session) -> StreetListResponse:
    query = text(f"""
        SELECT 
            s.Street_PRK,
            s.strName_TXT AS StreetName,
            s.strDescription_MEM,
            s.strPostCode_TXT,
            cz.cznName_TXT AS ZoneName
        FROM {DB_SCHEMA}.Street_TBL s
        LEFT JOIN {DB_SCHEMA}.LinkStreetZone_TBL lsz ON s.Street_PRK = lsz.lszStreet_FRK
        LEFT JOIN {DB_SCHEMA}.CameraZone_TBL cz ON lsz.lszZone_FRK = cz.CameraZone_PRK
        ORDER BY s.strName_TXT;
    """)
    rows = db.execute(query).mappings().all()
    data = [StreetDetail(**dict(r)) for r in rows]
    return StreetListResponse(total_count=len(data), data=data)


def get_unit_details(db: Session) -> UnitListResponse:
    query = text(f"""
        SELECT Unit_PRK, untUnitName_TXT, untOtherInfo_MEM 
        FROM {DB_SCHEMA}.Unit_TBL
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
    skip: int = 0,
    limit: int = 500,
) -> IncidentListResponse:
    
    zone_list = ",".join(str(z) for z in zone_ids) if zone_ids else None
    street_list = ",".join(str(s) for s in street_ids) if street_ids else None
    unit_list = ",".join(str(u) for u in unit_ids) if unit_ids else None
    
    base_params = {
        "zone_list": zone_list,
        "street_list": street_list,
        "unit_list": unit_list,
        "date_from": date_from,
        "date_to": date_to,
        "status_filter": status_filter,
    }

    where_clause = f"""
        WHERE 1 = 1
        AND (COALESCE(:zone_list, '') IS NULL OR COALESCE(:zone_list, '') = '' 
            OR il.inlZone_FRK IN (SELECT TRIM([value]) FROM STRING_SPLIT(:zone_list, ',')))

        AND (COALESCE(:street_list, '') IS NULL OR COALESCE(:street_list, '') = '' 
            OR il.inlStreet_FRK IN (SELECT TRIM([value]) FROM STRING_SPLIT(:street_list, ',')))

        AND (COALESCE(:unit_list, '') IS NULL OR COALESCE(:unit_list, '') = '' 
            OR il.inlUnit_FRK IN (SELECT TRIM([value]) FROM STRING_SPLIT(:unit_list, ',')))

        AND (:date_from IS NULL OR il.inlDateTime_DTM >= :date_from)
        AND (:date_to IS NULL OR il.inlDateTime_DTM <= :date_to)
        AND (:status_filter IS NULL OR il.inlStatus_FRK = :status_filter)
    """

    select_join_clause = f"""
        FROM {DB_SCHEMA}.IncidentLog_TBL il
        LEFT JOIN {DB_SCHEMA}.IncidentCategory_TBL cat ON il.inlCategory_FRK = cat.IncidentCategory_PRK
        LEFT JOIN {DB_SCHEMA}.IncidentStatus_TBL st ON il.inlStatus_FRK = st.IncidentStatus_PRK
        LEFT JOIN {DB_SCHEMA}.CameraZone_TBL cz ON il.inlZone_FRK = cz.CameraZone_PRK
        LEFT JOIN {DB_SCHEMA}.Street_TBL s ON il.inlStreet_FRK = s.Street_PRK
        LEFT JOIN {DB_SCHEMA}.Unit_TBL u ON il.inlUnit_FRK = u.Unit_PRK
    """
    
    count_query = text(f"SELECT COUNT(*) {select_join_clause} {where_clause}")

    data_query = text(f"""
        SELECT 
            il.IncidentLog_PRK, il.inlIncidentDetails_MEM, il.inlDateTime_DTM,
            il.inlCategory_FRK, cat.incName_TXT AS CategoryName,
            il.inlStatus_FRK, st.insName_TXT AS StatusName,
            il.inlZone_FRK, cz.cznName_TXT AS ZoneName,
            il.inlStreet_FRK, s.strName_TXT AS StreetName,
            il.inlUnit_FRK, u.untUnitName_TXT AS UnitName, u.untOtherInfo_MEM AS UnitDetails
        {select_join_clause}
        {where_clause}
        ORDER BY il.IncidentLog_PRK DESC
        OFFSET :skip ROWS FETCH NEXT :limit ROWS ONLY;
    """)

    data_params = {**base_params, "skip": skip, "limit": limit}

    try:
        total_rows_result = db.execute(count_query, base_params).scalar_one()
        total_count = int(total_rows_result) if total_rows_result is not None else 0
        rows = db.execute(data_query, data_params).mappings().all()
        data = [IncidentDetail(**dict(r)) for r in rows]
        
        return IncidentListResponse(total_count=total_count, data=data)
    except Exception as e:
        print(f"❌ ERROR EXECUTING INCIDENT QUERY: {e}")
        return IncidentListResponse(total_count=0, data=[])