import duckdb
import pandas as pd
import os
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
import re

from schemas import DashboardFilters, ReportRow, ReportResponse # Will need to create/update schemas.py later

# Configuration for DuckDB cache directory
DUCKDB_CACHE_DIR = "duckdb_cache"
os.makedirs(DUCKDB_CACHE_DIR, exist_ok=True)

DB_SCHEMA = "dbo" # Assuming dbo schema for production DB queries

# ---------------------------------------------------------------
# Helper: Build IN (...) dynamic parameter lists (copied from report_data_service.py)
# ---------------------------------------------------------------
def build_in_clause_params(filter_list: Optional[List[int]], column_name: str, prefix: str):
    if not filter_list:
        return "1=1", {}

    names = [f"{prefix}_{i}" for i in range(len(filter_list))]
    params = {name: value for name, value in zip(names, filter_list)}
    clause = f"{column_name} IN ({', '.join(':' + name for name in names)})"

    return clause, params

# ---------------------------------------------------------------
# Helper: Get DuckDB file path for a given month
# ---------------------------------------------------------------
def get_duckdb_file_path(month_date: datetime) -> str:
    """Generates a unique file name based on the month and year."""
    month_year_str = month_date.strftime("%Y%m")
    return os.path.join(DUCKDB_CACHE_DIR, f"report_data_{month_year_str}.duckdb")

# ---------------------------------------------------------------
# Helper: Check if DuckDB file is stale (older than 24 hours)
# ---------------------------------------------------------------
def is_duckdb_file_stale(file_path: str) -> bool:
    """Checks if the DuckDB file exists and is older than 24 hours."""
    if not os.path.exists(file_path):
        return True
    
    last_modified_time = datetime.fromtimestamp(os.path.getmtime(file_path))
    return (datetime.now() - last_modified_time) > timedelta(hours=24)

# ---------------------------------------------------------------
# Main: Regenerate DuckDB Cache from Production DB
# ---------------------------------------------------------------
def regenerate_duckdb_cache(db: Session, month_start_date: datetime, month_end_date: datetime):
    """
    Regenerates the DuckDB cache file for a given month from the production database.
    This includes fetching fresh data and applying waivers implicitly from the updated IncidentLog_TBL.
    """
    duckdb_file_path = get_duckdb_file_path(month_start_date)

    # Base SQL CTE (Updated from report_data_service.py to include IncidentLog_PRK)
    # Note: Removed dynamic filters ({zone_where}, etc.) as they are applied in query_cached_report_data
    base_sql_cte = f"""
        WITH PenaltyBase AS (
        SELECT
            n.NVR_PRK,
            n.nvrAlias_TXT,
            n.nvrIPAddress_TXT,

            cam.Camera_PRK,
            cam.camName_TXT,

            gr.gclZone_FRK,
            z.cznName_TXT AS ZoneName,
            gr.gclStreet_FRK,
            s.strName_TXT AS StreetName,
            gr.gclBuilding_FRK,
            b.bldBuildingName_TXT AS BuildingName,
            gr.gclUnit_FRK,
            u.untUnitName_TXT AS UnitName,
            il.IncidentLog_PRK, -- NEWLY ADDED
            il.inlSubSubCategory_FRK AS WaiverCategory, -- Include WaiverCategory from IncidentLog_TBL
            lo.OfflineTime,
            lon.OnlineTime,
            eff.EffectiveEndForMonth,

            -- Offline minutes clipped within the reporting month
            CAST(
                CASE
                    WHEN lo.OfflineTime IS NULL THEN NULL
                    WHEN eff.EffectiveEndForMonth < lo.OfflineTime THEN 0
                    ELSE DATEDIFF(MINUTE, lo.OfflineTime, eff.EffectiveEndForMonth)
                END AS INT
            ) AS OfflineMinutes,

            -- Penalty: if OfflineMinutes >= 1440 then ceil(hours)*500 else 0
            CAST(
                CASE
                    WHEN lo.OfflineTime IS NULL THEN 0
                    WHEN il.inlSubSubCategory_FRK IS NOT NULL THEN 0 -- If a waiver category is set, penalty is 0
                    ELSE
                        CASE
                            WHEN CAST(
                                    CASE
                                        WHEN eff.EffectiveEndForMonth < lo.OfflineTime THEN 0
                                        ELSE DATEDIFF(MINUTE, lo.OfflineTime, eff.EffectiveEndForMonth)
                                    END AS FLOAT
                                ) >= 1440
                            THEN CEILING(
                                    CAST(
                                        CASE
                                            WHEN eff.EffectiveEndForMonth < lo.OfflineTime THEN 0
                                            ELSE DATEDIFF(MINUTE, lo.OfflineTime, eff.EffectiveEndForMonth)
                                        END AS FLOAT
                                    ) / 60.0
                                ) * 500.0
                            ELSE 0.0
                        END
                END AS DECIMAL(10, 2)
            ) AS PenaltyAmount
            -- Status column removed as per new query
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
        LEFT JOIN {DB_SCHEMA}.IncidentLog_TBL il ON il.inlZone_FRK = gr.gclZone_FRK AND il.inlSourceDevice_FRK = cam.Camera_PRK -- Join to get IncidentLog_PRK and WaiverCategory

        -- Latest disconnect inside the period (use il from the LEFT JOIN directly)
        OUTER APPLY (
            SELECT TOP (1)
                il_lo.inlDateTime_DTM AS OfflineTime
            FROM {DB_SCHEMA}.IncidentLog_TBL il_lo
            WHERE il_lo.inlSourceDevice_FRK = cam.Camera_PRK
              AND il_lo.inlDateTime_DTM >= :start_date
              AND il_lo.inlDateTime_DTM < :end_date
              AND il_lo.inlAlarmMessage_TXT LIKE '%Channel disconnect%'
            ORDER BY il_lo.inlDateTime_DTM DESC
        ) lo

        -- First recovery after that disconnect (within period window; may be NULL)
        OUTER APPLY (
            SELECT TOP (1)
                il2_lon.inlDateTime_DTM AS OnlineTime
            FROM {DB_SCHEMA}.IncidentLog_TBL il2_lon
            WHERE il2_lon.inlSourceDevice_FRK = cam.Camera_PRK
              AND il2_lon.inlDateTime_DTM >= :start_date
              AND il2_lon.inlDateTime_DTM < :end_date
              AND il2_lon.inlAlarmMessage_TXT LIKE '%Channel connected%'
              AND lo.OfflineTime IS NOT NULL
              AND il2_lon.inlDateTime_DTM > lo.OfflineTime
            ORDER BY il2_lon.inlDateTime_DTM ASC
        ) lon

        -- Compute EffectiveEndForMonth once (clip recovery to end date or GETDATE)
        CROSS APPLY (
            SELECT
                CASE
                    WHEN lo.OfflineTime IS NULL THEN NULL
                    ELSE
                        CASE
                            WHEN lon.OnlineTime IS NOT NULL AND lon.OnlineTime <= :end_date THEN lon.OnlineTime
                            WHEN lon.OnlineTime IS NOT NULL AND lon.OnlineTime > :end_date THEN :end_date
                            WHEN lon.OnlineTime IS NULL AND GETDATE() <= :end_date THEN GETDATE()
                            ELSE :end_date
                        END
                END AS EffectiveEndForMonth
        ) eff

        WHERE b.bldAlarmContractNumber_TXT = 'PWD'
    )
    SELECT * FROM PenaltyBase;
    """

    params = {
        "start_date": month_start_date,
        "end_date": month_end_date,
    }

    # Execute the query to fetch fresh data from the production database
    raw_sql_result = db.execute(text(base_sql_cte), params).mappings().all()
    df = pd.DataFrame([dict(row) for row in raw_sql_result])

    # Save to DuckDB File
    with duckdb.connect(database=duckdb_file_path, read_only=False) as con:
        con.execute("CREATE OR REPLACE TABLE cached_report_data AS SELECT * FROM df;")

# ---------------------------------------------------------------
# Main: Update IncidentLog_TBL and Refresh Cache
# ---------------------------------------------------------------
def update_incident_log_and_refresh_cache(db: Session, incident_log_prk: int, subcategory_id: int, month_start_date: datetime, month_end_date: datetime):
    """
    Updates the inlSubSubCategory_FRK in IncidentLog_TBL in the production database
    and then regenerates the DuckDB cache for the affected month.
    """
    # 1. Update Production DB (IncidentLog_TBL)
    update_sql = text(f"""
        UPDATE {DB_SCHEMA}.IncidentLog_TBL
        SET inlSubSubCategory_FRK = :subcategory_id
        WHERE IncidentLog_PRK = :incident_log_prk;
    """)
    db.execute(update_sql, {"subcategory_id": subcategory_id, "incident_log_prk": incident_log_prk})
    db.commit()

    # 2. Regenerate DuckDB Cache for the month
    regenerate_duckdb_cache(db, month_start_date, month_end_date)

# ---------------------------------------------------------------
# Main: Query Cached Report Data
# ---------------------------------------------------------------
def query_cached_report_data(month_start_date: datetime, filters: DashboardFilters) -> ReportResponse:
    """
    Queries the DuckDB cache for report data, applying filters and pagination.
    Assumes the cache is already up-to-date.
    """
    duckdb_file_path = get_duckdb_file_path(month_start_date)

    if not os.path.exists(duckdb_file_path):
        # This case should ideally be handled by get_detailed_report ensuring cache is regenerated
        return ReportResponse(total_rows=0, data=[])

    with duckdb.connect(database=duckdb_file_path, read_only=True) as con:
        # Build DuckDB specific WHERE clauses based on filters
        zone_where, zone_params = build_in_clause_params(filters.zone_id, "gclZone_FRK", "zone_duckdb")
        street_where, street_params = build_in_clause_params(filters.street_id, "gclStreet_FRK", "street_duckdb")
        unit_where, unit_params = build_in_clause_params(filters.unit_id, "gclUnit_FRK", "unit_duckdb")

        all_duckdb_params = {**zone_params, **street_params, **unit_params}

        # Build dynamic WHERE clause
        where_clauses = [zone_where, street_where, unit_where]
        combined_where_clause = " AND ".join(filter(lambda x: x != "1=1", where_clauses))
        if not combined_where_clause:
            combined_where_clause = "1=1"

        duckdb_query = f"""
            SELECT * FROM cached_report_data
            WHERE {combined_where_clause}
            ORDER BY Camera_PRK
            OFFSET {filters.skip} ROWS
            FETCH NEXT {filters.limit} ROWS ONLY;
        """
        duckdb_query_result_df = con.execute(duckdb_query, all_duckdb_params).fetchdf()

        # Get total rows for pagination
        count_duckdb_query = f"""
            SELECT COUNT(*) FROM cached_report_data
            WHERE {combined_where_clause};
        """
        total_rows = con.execute(count_duckdb_query, all_duckdb_params).fetchone()[0]

        # Convert DataFrame to list of ReportRow
        data = [ReportRow(**row) for index, row in duckdb_query_result_df.iterrows()]

        return ReportResponse(total_rows=total_rows, data=data)
