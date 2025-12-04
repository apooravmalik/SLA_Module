# services/report_data_service.py
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta
from schemas import DashboardFilters, ReportRow, ReportResponse
from typing import Optional, List
from decimal import Decimal
import re

DB_SCHEMA = "dbo"


# --- New Base SQL Template (Without MonthBounds CTE or final WHERE/ORDER BY) ---
# This implements accurate time-clipping and the updated penalty rule (CEILING(hours) * 500).
BASE_REPORT_SQL_NEW = """
SELECT
    n.NVR_PRK, n.nvrAlias_TXT, n.nvrIPAddress_TXT,
    cam.Camera_PRK, cam.camName_TXT,
    gr.gclZone_FRK, z.cznName_TXT AS ZoneName,
    gr.gclStreet_FRK, s.strName_TXT AS StreetName,
    gr.gclBuilding_FRK, b.bldBuildingName_TXT AS BuildingName,
    gr.gclUnit_FRK, u.untUnitName_TXT AS UnitName,
    lo.OfflineTime,
    lon.OnlineTime,
    eff.EffectiveEndForMonth, -- New column for debugging time clipping

    -- Offline minutes clipped within the reporting month
    CASE
      WHEN lo.OfflineTime IS NULL THEN NULL
      WHEN eff.EffectiveEndForMonth < lo.OfflineTime THEN 0
      ELSE DATEDIFF(MINUTE, lo.OfflineTime, eff.EffectiveEndForMonth)
    END AS OfflineMinutes,

    -- Penalty: if OfflineMinutes >= 1440 then ceil(hours)*500 else 0
    CAST(
        CASE
            WHEN lo.OfflineTime IS NULL THEN 0
            WHEN
                (CASE
                    WHEN eff.EffectiveEndForMonth < lo.OfflineTime THEN 0
                    ELSE DATEDIFF(MINUTE, lo.OfflineTime, eff.EffectiveEndForMonth)
                END) >= 1440
            THEN CEILING(
                CAST(
                    (CASE
                        WHEN eff.EffectiveEndForMonth < lo.OfflineTime THEN 0
                        ELSE DATEDIFF(MINUTE, lo.OfflineTime, eff.EffectiveEndForMonth)
                    END) AS FLOAT
                ) / 60.0
            ) * 500
            ELSE 0
        END AS DECIMAL(10, 2)
    ) AS PenaltyAmount,

    -- Status considering the report month
    CASE
      WHEN lo.OfflineTime IS NULL THEN 'Online'
      WHEN lo.OfflineTime IS NOT NULL AND lon.OnlineTime IS NULL
           AND (CASE WHEN GETDATE() <= :end_date_eff4 THEN GETDATE() ELSE :end_date_eff5 END) >= lo.OfflineTime THEN 'Offline'
      WHEN lon.OnlineTime IS NOT NULL AND lon.OnlineTime <= :end_date_eff6 AND lon.OnlineTime > lo.OfflineTime THEN 'Online'
      WHEN lon.OnlineTime IS NOT NULL AND lon.OnlineTime > :end_date_eff7 THEN 'Offline'
      ELSE 'Offline'
    END AS Status

FROM {DB_SCHEMA}.Camera_TBL cam

-- NVR mapping
LEFT JOIN {DB_SCHEMA}.NVRChannel_TBL nc ON nc.nchCamera_FRK = cam.Camera_PRK
LEFT JOIN {DB_SCHEMA}.NVR_TBL n ON n.NVR_PRK = nc.nchNVR_FRK

-- Pick one geo-link per camera (TOP 1) to avoid duplication
OUTER APPLY (
    SELECT TOP (1) g.*
    FROM {DB_SCHEMA}.GeoRollupCameraLink_TBL g
    WHERE g.gclCamera_FRK = cam.Camera_PRK
) gr
LEFT JOIN {DB_SCHEMA}.CameraZone_TBL z ON z.CameraZone_PRK = gr.gclZone_FRK
LEFT JOIN {DB_SCHEMA}.Street_TBL s ON s.Street_PRK = gr.gclStreet_FRK
LEFT JOIN {DB_SCHEMA}.Building_TBL b ON b.Building_PRK = gr.gclBuilding_FRK
LEFT JOIN {DB_SCHEMA}.Unit_TBL u ON u.Unit_PRK = gr.gclUnit_FRK

-- Latest disconnect inside the month (if any)
OUTER APPLY (
    SELECT TOP (1)
        il.inlDateTime_DTM AS OfflineTime
    FROM {DB_SCHEMA}.IncidentLog_TBL il
    WHERE il.inlSourceDevice_FRK = cam.Camera_PRK
      AND il.inlDateTime_DTM >= :start_date_lo
      AND il.inlDateTime_DTM < :end_date_lo
      AND il.inlAlarmMessage_TXT LIKE '%Channel disconnect%'
    ORDER BY il.inlDateTime_DTM DESC
) lo

-- First recovery after that disconnect (within month window; may be NULL)
OUTER APPLY (
    SELECT TOP (1)
        il2.inlDateTime_DTM AS OnlineTime
    FROM {DB_SCHEMA}.IncidentLog_TBL il2
    WHERE il2.inlSourceDevice_FRK = cam.Camera_PRK
      AND il2.inlDateTime_DTM >= :start_date_lon
      AND il2.inlDateTime_DTM < :end_date_lon
      AND il2.inlAlarmMessage_TXT LIKE '%Channel connected%'
      AND lo.OfflineTime IS NOT NULL
      AND il2.inlDateTime_DTM > lo.OfflineTime
    ORDER BY il2.inlDateTime_DTM ASC
) lon

-- Compute EffectiveEndForMonth once
CROSS APPLY (
    SELECT
      CASE
        WHEN lo.OfflineTime IS NULL THEN NULL
        ELSE
          CASE
            WHEN lon.OnlineTime IS NOT NULL AND lon.OnlineTime <= :end_date_eff1 THEN lon.OnlineTime
            WHEN lon.OnlineTime IS NOT NULL AND lon.OnlineTime > :end_date_eff2 THEN :end_date_eff3
            WHEN lon.OnlineTime IS NULL AND GETDATE() <= :end_date_eff4 THEN GETDATE()
            ELSE :end_date_eff5
          END
      END AS EffectiveEndForMonth
) eff
"""

# ---------------------------------------------------------------
# Substitute parameters into SQL for debugging
# ---------------------------------------------------------------
def substitute_params(query: str, params: dict) -> str:
    def replacer(match):
        key = match.group(1)
        value = params.get(key)

        if value is None:
            return match.group(0)

        if isinstance(value, datetime):
            return f"'{value.strftime('%Y-%m-%d %H:%M:%S')}'"
        if isinstance(value, (int, float, Decimal)):
            return str(value)

        return str(value)

    return re.sub(r':(\b\w+\b)', replacer, query)


# ---------------------------------------------------------------
# Build IN (...) dynamic parameter lists
# ---------------------------------------------------------------
def build_in_clause_params(filter_list: Optional[List[int]], column_name: str, prefix: str):
    if not filter_list:
        return "1=1", {}

    names = [f"{prefix}_{i}" for i in range(len(filter_list))]
    params = {name: value for name, value in zip(names, filter_list)}
    # NOTE: The column name uses the alias 'gr' for the geo rollup data.
    clause = f"{column_name} IN ({', '.join(':' + name for name in names)})"

    return clause, params


# ---------------------------------------------------------------
# Main Report Function
# ---------------------------------------------------------------
def get_detailed_report(db: Session, filters: DashboardFilters) -> ReportResponse:

    # -----------------------------------------------------------
    # FIXED DATE LOGIC — USES FILTERS OR PREVIOUS MONTH DEFAULT
    # -----------------------------------------------------------
    has_valid_from = filters.date_from is not None and filters.date_from != "" and filters.date_from != " "
    has_valid_to   = filters.date_to is not None and filters.date_to != "" and filters.date_to != " "

    if has_valid_from and has_valid_to:
        start_date = filters.date_from
        end_date = filters.date_to

    else:
        # Previous-month logic (DEFAULT)
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

        first_day_this_month = today.replace(day=1)
        last_day_prev_month = first_day_this_month - timedelta(days=1)
        first_day_prev_month = last_day_prev_month.replace(day=1)

        start_date = first_day_prev_month
        end_date = first_day_this_month

    print("\n REPORT DATE RANGE ---------------------------")
    print("START DATE =", start_date)
    print("END DATE   =", end_date)
    print("SKIP =", filters.skip)
    print("LIMIT =", filters.limit)
    print("------------------------------------------------\n")

    # -----------------------------------------------------------
    # Dynamic Filters (Zone / Street / Unit)
    # -----------------------------------------------------------
    # Filter on the 'gr' alias columns from the OUTER APPLY for the geo-location links
    zone_where, zone_params = build_in_clause_params(filters.zone_id, "gr.gclZone_FRK", "zone")
    street_where, street_params = build_in_clause_params(filters.street_id, "gr.gclStreet_FRK", "street")
    unit_where, unit_params = build_in_clause_params(filters.unit_id, "gr.gclUnit_FRK", "unit")

    # FIX: Use unique named parameters for all date bindings in the SQL template
    params = {
        "start_date_lo": start_date, 
        "start_date_lon": start_date, 
        
        "end_date_lo": end_date, 
        "end_date_lon": end_date, 
        "end_date_eff1": end_date, 
        "end_date_eff2": end_date,
        "end_date_eff3": end_date,
        "end_date_eff4": end_date,
        "end_date_eff5": end_date,
        "end_date_eff6": end_date,
        "end_date_eff7": end_date,
        
        **zone_params,
        **street_params,
        **unit_params
    }

    # -----------------------------------------------------------
    # Combine Base SQL with Dynamic WHERE Clauses
    # -----------------------------------------------------------
    # Format the template with the database schema name
    base_sql_with_schema = BASE_REPORT_SQL_NEW.format(DB_SCHEMA=DB_SCHEMA)
    
    # 1. TOTAL COUNT QUERY - Wraps the base SQL in a subquery for counting
    count_sql = text(f"""
        SELECT COUNT(*) AS total
        FROM (
            {base_sql_with_schema}
            WHERE 
                {zone_where}
                AND {street_where}
                AND {unit_where}
        ) AS FilteredData;
    """)

    # 2. DATA FETCH QUERY (PAGINATED/FULL DOWNLOAD) - Applies WHERE, ORDER BY, OFFSET/FETCH
    data_sql = text(f"""
        {base_sql_with_schema}
        WHERE 
            {zone_where}
            AND {street_where}
            AND {unit_where}
        ORDER BY cam.Camera_PRK 
        OFFSET :skip ROWS
        FETCH NEXT :limit ROWS ONLY;
    """)

    # Add pagination parameters to params for execution
    # This ensures that the high 'limit' value passed from the download route is used.
    params["skip"] = filters.skip
    params["limit"] = filters.limit
    
    print("\n--- EXECUTABLE REPORT DATA QUERY (PAGINATED) ---")
    print(substitute_params(data_sql.text, params))
    print("------------------------------------------------------------\n")

    try:
        # Execute COUNT query
        total_rows_result = db.execute(count_sql, params).scalar_one()
        total_rows = int(total_rows_result) if total_rows_result is not None else 0

        # Execute DATA query
        rows = db.execute(data_sql, params).mappings().all()
        
        # Pydantic maps the fields it knows (ReportRow) and ignores extras (EffectiveEndForMonth, Status)
        data = [ReportRow(**dict(r)) for r in rows]

        return ReportResponse(total_rows=total_rows, data=data)

    except Exception as e:
        print(f" ERROR EXECUTING PAGINATED REPORT QUERY: {e}")
        return ReportResponse(total_rows=0, data=[])