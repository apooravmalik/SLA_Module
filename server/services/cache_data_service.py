import duckdb
import pandas as pd
import os
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
import re

from schemas import DashboardFilters, ReportRow, ReportResponse

# Configuration for DuckDB cache directory
DUCKDB_CACHE_DIR = "duckdb_cache"
os.makedirs(DUCKDB_CACHE_DIR, exist_ok=True)

DB_SCHEMA = "dbo"

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
# Helper: Check if table exists in DuckDB file
# ---------------------------------------------------------------
def table_exists_in_cache(file_path: str, table_name: str = "cached_report_data") -> bool:
    """Checks if a specific table exists in the DuckDB file."""
    if not os.path.exists(file_path):
        return False
    
    try:
        with duckdb.connect(database=file_path, read_only=True) as con:
            result = con.execute(f"SELECT * FROM information_schema.tables WHERE table_name = '{table_name}';").fetchone()
            return result is not None
    except Exception as e:
        print(f"Error checking table existence: {e}")
        return False

# ---------------------------------------------------------------
# Main: Regenerate DuckDB Cache from Production DB
# ---------------------------------------------------------------
def regenerate_duckdb_cache(db: Session, month_start_date: datetime, month_end_date: datetime):
    """
    Regenerates the DuckDB cache file for a given month from the production database.
    This includes fetching fresh data and applying waivers implicitly from the updated IncidentLog_TBL.
    """
    duckdb_file_path = get_duckdb_file_path(month_start_date)

    print(f"\nRegenerating DuckDB cache for {month_start_date.strftime('%Y-%m')}...")
    print(f"   Cache file: {duckdb_file_path}")

    # Base SQL CTE (UPDATED with New Logic)
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
                lo.IncidentLog_PRK, 
                lo.OfflineTime,
                lo.WaiverCategory,
                lon.OnlineTime,
                eff.EffectiveEndForMonth,

                DATEDIFF(
                    MINUTE,
                    lo.OfflineTime,
                    eff.EffectiveEndForMonth
                ) AS OfflineMinutes,

                CASE
                    WHEN lo.OfflineTime IS NULL THEN 0
                    WHEN lo.WaiverCategory IS NOT NULL THEN 0
                    WHEN DATEDIFF(MINUTE, lo.OfflineTime, eff.EffectiveEndForMonth) < 1440 THEN 0
                    ELSE CEILING(
                            CAST(
                                DATEDIFF(MINUTE, lo.OfflineTime, eff.EffectiveEndForMonth)
                                AS FLOAT
                            ) / 1440.0
                        ) * 500.0
                END AS PenaltyAmount

            FROM {DB_SCHEMA}.Camera_TBL cam

            LEFT JOIN {DB_SCHEMA}.NVRChannel_TBL nc ON nc.nchCamera_FRK = cam.Camera_PRK
            LEFT JOIN {DB_SCHEMA}.NVR_TBL n ON n.NVR_PRK = nc.nchNVR_FRK

            OUTER APPLY (
                SELECT TOP (1) g.*
                FROM {DB_SCHEMA}.GeoRollupCameraLink_TBL g
                WHERE g.gclCamera_FRK = cam.Camera_PRK
            ) gr
            LEFT JOIN {DB_SCHEMA}.CameraZone_TBL z ON z.CameraZone_PRK = gr.gclZone_FRK
            LEFT JOIN {DB_SCHEMA}.Street_TBL s ON s.Street_PRK = gr.gclStreet_FRK
            LEFT JOIN {DB_SCHEMA}.Building_TBL b ON b.Building_PRK = gr.gclBuilding_FRK
            LEFT JOIN {DB_SCHEMA}.Unit_TBL u ON u.Unit_PRK = gr.gclUnit_FRK
            OUTER APPLY (
                SELECT TOP (1)
                    il_lo.IncidentLog_PRK, -- Explicitly Fetch ID
                    il_lo.inlDateTime_DTM AS OfflineTime,
                    il_lo.inlSubSubCategory_FRK AS WaiverCategory
                FROM {DB_SCHEMA}.IncidentLog_TBL il_lo
                WHERE il_lo.inlSourceDevice_FRK = cam.Camera_PRK
                  AND il_lo.inlDateTime_DTM >= :start_date
                  AND il_lo.inlDateTime_DTM <  :end_date
                  AND il_lo.inlAlarmMessage_TXT LIKE '%Channel disconnect%'
                ORDER BY il_lo.inlDateTime_DTM DESC
            ) lo

            OUTER APPLY (
                SELECT TOP (1)
                    il_on.inlDateTime_DTM AS OnlineTime
                FROM {DB_SCHEMA}.IncidentLog_TBL il_on
                WHERE il_on.inlSourceDevice_FRK = cam.Camera_PRK
                  AND il_on.inlDateTime_DTM > lo.OfflineTime
                  AND il_on.inlAlarmMessage_TXT LIKE '%Channel connected%'
                ORDER BY il_on.inlDateTime_DTM ASC
            ) lon

            CROSS APPLY (
                SELECT
                    CASE
                        WHEN lo.OfflineTime IS NULL THEN NULL
                        WHEN lon.OnlineTime IS NOT NULL AND lon.OnlineTime <= :end_date
                             THEN lon.OnlineTime
                        ELSE :end_date
                    END AS EffectiveEndForMonth
            ) eff

            WHERE b.bldAlarmContractNumber_TXT = 'PWD'
        )
        SELECT *
        FROM PenaltyBase;
    """

    params = {
        "start_date": month_start_date,
        "end_date": month_end_date,
    }

    try:
        # Execute the query to fetch fresh data from the production database
        print("   Executing SQL query on production database...")
        raw_sql_result = db.execute(text(base_sql_cte), params).mappings().all()
        df = pd.DataFrame([dict(row) for row in raw_sql_result])
        print(f"Fetched {len(df)} rows from production DB")

        # Convert PenaltyAmount to float to avoid precision issues
        if 'PenaltyAmount' in df.columns:
            df['PenaltyAmount'] = pd.to_numeric(df['PenaltyAmount'], errors='coerce').fillna(0.0)

        # Save to DuckDB File with explicit column casting
        print("   Writing data to DuckDB cache...")
        with duckdb.connect(database=duckdb_file_path, read_only=False) as con:
            con.register('df_temp', df)
            
            con.execute("""
                CREATE OR REPLACE TABLE cached_report_data AS 
                SELECT 
                    NVR_PRK,
                    nvrAlias_TXT,
                    nvrIPAddress_TXT,
                    Camera_PRK,
                    camName_TXT,
                    gclZone_FRK,
                    ZoneName,
                    gclStreet_FRK,
                    StreetName,
                    gclBuilding_FRK,
                    BuildingName,
                    gclUnit_FRK,
                    UnitName,
                    IncidentLog_PRK,
                    WaiverCategory,
                    OfflineTime,
                    OnlineTime,
                    EffectiveEndForMonth,
                    OfflineMinutes,
                    CAST(PenaltyAmount AS DECIMAL(18,2)) AS PenaltyAmount
                FROM df_temp;
            """)
            
            con.unregister('df_temp')
        
        print(f"Cache regeneration complete: {duckdb_file_path}\n")
        
    except Exception as e:
        print(f"ERROR during cache regeneration: {e}\n")
        raise

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
    Queries the DuckDB cache for report data for a SINGLE month, applying filters only.
    Pagination is handled by the calling function (report_data_service.py).
    """
    duckdb_file_path = get_duckdb_file_path(month_start_date)

    if not os.path.exists(duckdb_file_path) or not table_exists_in_cache(duckdb_file_path):
        print(f"WARNING: Cache file missing or table doesn't exist: {duckdb_file_path}")
        return ReportResponse(total_rows=0, data=[])

    try:
        with duckdb.connect(database=duckdb_file_path, read_only=True) as con:
            # Build WHERE clauses with direct value substitution for DuckDB
            where_clauses = []
            
            if filters.zone_id and len(filters.zone_id) > 0:
                zone_ids = ",".join(str(z) for z in filters.zone_id)
                where_clauses.append(f"gclZone_FRK IN ({zone_ids})")
            
            if filters.street_id and len(filters.street_id) > 0:
                street_ids = ",".join(str(s) for s in filters.street_id)
                where_clauses.append(f"gclStreet_FRK IN ({street_ids})")
            
            if filters.unit_id and len(filters.unit_id) > 0:
                unit_ids = ",".join(str(u) for u in filters.unit_id)
                where_clauses.append(f"gclUnit_FRK IN ({unit_ids})")
            
            combined_where_clause = " AND ".join(where_clauses) if where_clauses else "1=1"

            # --- Dynamic Sorting Logic ---
            sort_map = {
                "IncidentLog_PRK": "IncidentLog_PRK",
                "PenaltyAmount": "PenaltyAmount",
                "OfflineTime": "OfflineTime",
                "OnlineTime": "OnlineTime",
                "OfflineMinutes": "OfflineMinutes",
                "Camera_PRK": "Camera_PRK",
                "nvrAlias_TXT": "nvrAlias_TXT",
                "camName_TXT": "camName_TXT",
                "ZoneName": "ZoneName",
                "StreetName": "StreetName",
                "UnitName": "UnitName"
            }
            
            sort_column = sort_map.get(filters.sort_key, "IncidentLog_PRK")
            sort_direction = "DESC" if filters.sort_dir and filters.sort_dir.lower() == "desc" else "ASC"

            duckdb_query = f"""
                SELECT * FROM cached_report_data
                WHERE {combined_where_clause}
                ORDER BY {sort_column} {sort_direction}
                LIMIT {filters.limit} OFFSET {filters.skip};
            """
            
            print(f"DuckDB Query ({month_start_date.strftime('%Y-%m')}):\n{duckdb_query}\n")
            
            duckdb_query_result_df = con.execute(duckdb_query).fetchdf()

            # Get total rows for pagination
            count_duckdb_query = f"""
                SELECT COUNT(*) FROM cached_report_data
                WHERE {combined_where_clause};
            """
            total_rows = con.execute(count_duckdb_query).fetchone()[0]

            # Convert DataFrame to list of ReportRow
            duckdb_query_result_df = duckdb_query_result_df.replace({pd.NA: None, pd.NaT: None})
            
            data = []
            for index, row in duckdb_query_result_df.iterrows():
                row_dict = row.to_dict()
                row_dict = {k: (None if pd.isna(v) else v) for k, v in row_dict.items()}
                data.append(ReportRow(**row_dict))

            return ReportResponse(total_rows=total_rows, data=data)
            
    except Exception as e:
        print(f"ERROR querying DuckDB cache: {e}")
        return ReportResponse(total_rows=0, data=[])