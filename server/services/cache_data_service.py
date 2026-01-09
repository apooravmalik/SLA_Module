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
# Helper: Build IN (...) dynamic parameter lists
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
# NEW: Helper to check if table exists in DuckDB file
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
        print(f"⚠️ Error checking table existence: {e}")
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

    print(f"\n🔄 Regenerating DuckDB cache for {month_start_date.strftime('%Y-%m')}...")
    print(f"   Cache file: {duckdb_file_path}")

    # Base SQL CTE
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
            il.IncidentLog_PRK,
            
            -- MATCHED: Using inlSubCategory_FRK to match your MSSQL query
            il.inlSubCategory_FRK AS WaiverCategory, 
            
            lo.OfflineTime,
            lon.OnlineTime,
            eff.EffectiveEndForMonth,

            CAST(
                CASE
                    WHEN lo.OfflineTime IS NULL THEN NULL
                    WHEN eff.EffectiveEndForMonth < lo.OfflineTime THEN 0
                    ELSE DATEDIFF(MINUTE, lo.OfflineTime, eff.EffectiveEndForMonth)
                END AS INT
            ) AS OfflineMinutes,

            -- MATCHED: Logic and Precision
            CAST(
                CASE
                    WHEN lo.OfflineTime IS NULL THEN 0
                    -- MATCHED: Use inlSubCategory_FRK for waiver check
                    WHEN il.inlSubCategory_FRK IS NOT NULL THEN 0 
                    ELSE
                        CASE
                            WHEN CAST(DATEDIFF(MINUTE, lo.OfflineTime, eff.EffectiveEndForMonth) AS FLOAT) >= 1440
                            THEN CEILING(
                                    CAST(DATEDIFF(MINUTE, lo.OfflineTime, eff.EffectiveEndForMonth) AS FLOAT) 
                                    / 1440.0 -- FIXED: Changed from 60.0 to 1440.0 to match daily penalty
                                ) * 500.0
                            ELSE 0.0
                        END
                END AS DECIMAL(18, 2) -- MATCHED: Precision for large values
            ) AS PenaltyAmount
        FROM {DB_SCHEMA}.Camera_TBL cam WITH (NOLOCK) -- Added NOLOCK to prevent deadlocks

        LEFT JOIN {DB_SCHEMA}.NVRChannel_TBL nc WITH (NOLOCK) ON nc.nchCamera_FRK = cam.Camera_PRK
        LEFT JOIN {DB_SCHEMA}.NVR_TBL n WITH (NOLOCK) ON n.NVR_PRK = nc.nchNVR_FRK

        OUTER APPLY (
            SELECT TOP (1) g.*
            FROM {DB_SCHEMA}.GeoRollupCameraLink_TBL g WITH (NOLOCK)
            WHERE g.gclCamera_FRK = cam.Camera_PRK
        ) gr
        LEFT JOIN {DB_SCHEMA}.CameraZone_TBL z WITH (NOLOCK) ON z.CameraZone_PRK = gr.gclZone_FRK
        LEFT JOIN {DB_SCHEMA}.Street_TBL s WITH (NOLOCK) ON s.Street_PRK = gr.gclStreet_FRK
        LEFT JOIN {DB_SCHEMA}.Building_TBL b WITH (NOLOCK) ON b.Building_PRK = gr.gclBuilding_FRK
        LEFT JOIN {DB_SCHEMA}.Unit_TBL u WITH (NOLOCK) ON u.Unit_PRK = gr.gclUnit_FRK
        
        -- MATCHED: Joining on inlSubCategory_FRK column
        LEFT JOIN {DB_SCHEMA}.IncidentLog_TBL il WITH (NOLOCK) 
            ON il.inlZone_FRK = gr.gclZone_FRK AND il.inlSourceDevice_FRK = cam.Camera_PRK

        OUTER APPLY (
            SELECT TOP (1) il_lo.inlDateTime_DTM AS OfflineTime
            FROM {DB_SCHEMA}.IncidentLog_TBL il_lo WITH (NOLOCK)
            WHERE il_lo.inlSourceDevice_FRK = cam.Camera_PRK
            AND il_lo.inlDateTime_DTM >= :start_date
            AND il_lo.inlDateTime_DTM < :end_date
            AND il_lo.inlAlarmMessage_TXT LIKE '%Channel disconnect%'
            ORDER BY il_lo.inlDateTime_DTM DESC
        ) lo

        OUTER APPLY (
            SELECT TOP (1) il2_lon.inlDateTime_DTM AS OnlineTime
            FROM {DB_SCHEMA}.IncidentLog_TBL il2_lon WITH (NOLOCK)
            WHERE il2_lon.inlSourceDevice_FRK = cam.Camera_PRK
            AND il2_lon.inlDateTime_DTM >= :start_date
            AND il2_lon.inlDateTime_DTM < :end_date
            AND il2_lon.inlAlarmMessage_TXT LIKE '%Channel connected%'
            AND lo.OfflineTime IS NOT NULL
            AND il2_lon.inlDateTime_DTM > lo.OfflineTime
            ORDER BY il2_lon.inlDateTime_DTM ASC
        ) lon

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

    try:
        # Execute the query to fetch fresh data from the production database
        print("   Executing SQL query on production database...")
        raw_sql_result = db.execute(text(base_sql_cte), params).mappings().all()
        df = pd.DataFrame([dict(row) for row in raw_sql_result])
        print(f"   ✅ Fetched {len(df)} rows from production DB")

        # Save to DuckDB File
        print("   Writing data to DuckDB cache...")
        with duckdb.connect(database=duckdb_file_path, read_only=False) as con:
            con.execute("CREATE OR REPLACE TABLE cached_report_data AS SELECT * FROM df;")
        
        print(f"   ✅ Cache regeneration complete: {duckdb_file_path}\n")
        
    except Exception as e:
        print(f"   ❌ ERROR during cache regeneration: {e}\n")
        raise

# ---------------------------------------------------------------
# Main: Update IncidentLog_TBL and Refresh Cache
# ---------------------------------------------------------------
def update_incident_log_and_refresh_cache(db: Session, incident_log_prk: int, subcategory_id: int, month_start_date: datetime, month_end_date: datetime):
    """
    Updates the inlSubCategory_FRK in IncidentLog_TBL in the production database
    and then regenerates the DuckDB cache for the affected month.
    """
    # 1. Update Production DB (IncidentLog_TBL)
    update_sql = text(f"""
        UPDATE {DB_SCHEMA}.IncidentLog_TBL
        SET inlSubCategory_FRK = :subcategory_id
        WHERE IncidentLog_PRK = :incident_log_prk;
    """)
    db.execute(update_sql, {"subcategory_id": subcategory_id, "incident_log_prk": incident_log_prk})
    db.commit()

    # 2. Regenerate DuckDB Cache for the month
    regenerate_duckdb_cache(db, month_start_date, month_end_date)

# ---------------------------------------------------------------
# Main: Query Cached Report Data (FIXED with table existence check)
# ---------------------------------------------------------------
def query_cached_report_data(month_start_date: datetime, filters: DashboardFilters) -> ReportResponse:
    """
    Queries the DuckDB cache for report data, applying filters and pagination.
    Assumes the cache is already up-to-date.
    """
    duckdb_file_path = get_duckdb_file_path(month_start_date)

    # 🔥 FIX: Check if table exists, not just the file
    if not os.path.exists(duckdb_file_path) or not table_exists_in_cache(duckdb_file_path):
        print(f"⚠️ WARNING: Cache file missing or table doesn't exist: {duckdb_file_path}")
        return ReportResponse(total_rows=0, data=[])

    try:
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
            # 🔥 FIX: Replace pandas NA/NaT with None before validation
            duckdb_query_result_df = duckdb_query_result_df.replace({pd.NA: None, pd.NaT: None})
            
            # Convert to dict and handle nulls
            data = []
            for index, row in duckdb_query_result_df.iterrows():
                row_dict = row.to_dict()
                # Ensure None instead of pandas NA types
                row_dict = {k: (None if pd.isna(v) else v) for k, v in row_dict.items()}
                data.append(ReportRow(**row_dict))

            return ReportResponse(total_rows=total_rows, data=data)
            
    except Exception as e:
        print(f"❌ ERROR querying DuckDB cache: {e}")
        return ReportResponse(total_rows=0, data=[])