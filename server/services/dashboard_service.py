# services/dashboard_service.py
import asyncio
from typing import Dict, Any, Optional
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text # Essential for raw SQL execution
from datetime import datetime, timedelta
from schemas import DashboardFilters, DashboardKPIs

# Assuming your schema is 'dbo' as defined in database.py
DB_SCHEMA = "dbo"
STATUS_OPEN_FK = 1  # Status code for 'Open' incidents
STATUS_CLOSED_FK = 2 # Status code for 'Closed' incidents

# --- 1. Raw SQL Execution Helper ---

def execute_count_query(db: Session, table_name: str, conditions: Optional[str] = None) -> int:
    """Executes a COUNT(*) query with optional WHERE clause conditions."""
    query_base = f"SELECT COUNT(*) FROM {DB_SCHEMA}.{table_name}"
    
    if conditions:
        query_sql = f"{query_base} WHERE {conditions}"
    else:
        query_sql = query_base
        
    try:
        result = db.execute(text(query_sql)).scalar_one()
        return result if result is not None else 0
    except Exception as e:
        print(f"Database error executing count query for {table_name}: {e}")
        return 0

# --- 2. Filter Clause Builder (for IncidentLog_TBL) ---

def build_incident_filter_clause(filters: DashboardFilters, include_status: Optional[str] = None) -> str:
    """Builds the SQL WHERE clause for IncidentLog_TBL based on user filters."""
    conditions = []
    
    # Map filters to IncidentLog_TBL Foreign Keys
    if filters.zone_id is not None:
        conditions.append(f"inlZone_FRK = {filters.zone_id}")
    if filters.street_id is not None:
        conditions.append(f"inlStreet_FRK = {filters.street_id}")
    if filters.unit_id is not None:
        conditions.append(f"inlUnit_FRK = {filters.unit_id}")
    
    # Date filters
    # NOTE: Using f-strings for date filtering here for simplicity, 
    # but parameterized queries are safer. We will use parameters in penalty query.
    if filters.date_from is not None:
        date_str = filters.date_from.strftime("'%Y-%m-%d %H:%M:%S'")
        conditions.append(f"inlDateTime_DTM >= {date_str}")
    if filters.date_to is not None:
        date_str = filters.date_to.strftime("'%Y-%m-%d %H:%M:%S'")
        conditions.append(f"inlDateTime_DTM <= {date_str}")

    # Specific Status Filter
    if include_status == 'Open':
        conditions.append(f"inlStatus_FRK = {STATUS_OPEN_FK}")
    elif include_status == 'Closed':
        conditions.append(f"inlStatus_FRK = {STATUS_CLOSED_FK}")

    return " AND ".join(conditions)

# --- 3. Synchronous Static KPI Calculation ---

def get_static_kpis(db: Session) -> Dict[str, int]:
    """Retrieves total counts for Zones, Streets, and Units/Buildings (Non-Filtered)."""
    return {
        "total_zones": execute_count_query(db, "CameraZone_TBL"),
        "total_streets": execute_count_query(db, "Street_TBL"),
        "total_units": execute_count_query(db, "Unit_TBL"), 
    }

# --- 4. Asynchronous Dynamic KPI Calculations (Count-based) ---

async def calculate_open_incidents(db: Session, filters: DashboardFilters) -> int:
    """Calculates open incidents based on filters (Status_FRK = 1)."""
    await asyncio.sleep(0.01)
    filter_clause = build_incident_filter_clause(filters, include_status='Open')
    return execute_count_query(db, "IncidentLog_TBL", filter_clause)

async def calculate_closed_incidents(db: Session, filters: DashboardFilters) -> int:
    """Calculates closed incidents based on filters (Status_FRK = 2)."""
    await asyncio.sleep(0.01)
    filter_clause = build_incident_filter_clause(filters, include_status='Closed')
    return execute_count_query(db, "IncidentLog_TBL", filter_clause)


async def calculate_penalty(db: Session, filters: DashboardFilters) -> Decimal:
    """
    Executes the complex SLA penalty calculation query using bound parameters.
    """
    await asyncio.sleep(0.3) # Simulate a heavy query

    # --- 1. Determine Dynamic Start/End Dates ---
    end_date = filters.date_to if filters.date_to else datetime.now()
    start_date = filters.date_from if filters.date_from else end_date - timedelta(hours=24)
    
    # --- 2. The Integrated SQL Query with SQLAlchemy Parameters ---
    penalty_query = text(f"""
        WITH MonthData AS (
            SELECT *
            FROM {DB_SCHEMA}.IncidentLog_TBL
            WHERE inlDateTime_DTM >= :start_date
              AND inlDateTime_DTM <  :end_date
        ),
        LatestOffline AS (
            SELECT
                inlSourceDevice_FRK AS Device_PRK,
                inlDateTime_DTM AS OfflineTime,
                ROW_NUMBER() OVER (
                    PARTITION BY inlSourceDevice_FRK
                    ORDER BY inlDateTime_DTM DESC
                ) AS rn
            FROM MonthData
            WHERE inlAlarmMessage_TXT LIKE '%%Channel disconnect%%'
        ),
        LatestOnline AS (
            SELECT
                m.inlSourceDevice_FRK AS Device_PRK,
                m.inlDateTime_DTM AS OnlineTime
            FROM MonthData m
            JOIN LatestOffline lo
                ON m.inlSourceDevice_FRK = lo.Device_PRK
               AND lo.rn = 1
               AND m.inlDateTime_DTM > lo.OfflineTime
            WHERE m.inlAlarmMessage_TXT LIKE '%%Channel connected%%'
        ),
        PenaltyData AS (
            SELECT
                cam.Camera_PRK,
                g.gclZone_FRK,
                g.gclStreet_FRK,
                g.gclBuilding_FRK,
                g.gclUnit_FRK,
                CASE
                    -- Penalty rule: 5 units penalty for every 1440 minutes (24 hours) of downtime
                    WHEN DATEDIFF(MINUTE, lo.OfflineTime, lon.OnlineTime) >= 1440
                        THEN (DATEDIFF(MINUTE, lo.OfflineTime, lon.OnlineTime) / 1440) * 5
                    ELSE 0
                END AS PenaltyAmount
            FROM {DB_SCHEMA}.Camera_TBL cam
            LEFT JOIN {DB_SCHEMA}.GeoRollupCameraLink_TBL g ON g.gclCamera_FRK = cam.Camera_PRK
            LEFT JOIN LatestOffline lo ON lo.Device_PRK = cam.Camera_PRK
            LEFT JOIN LatestOnline lon ON lon.Device_PRK = cam.Camera_PRK
        )
        SELECT 
            SUM(PenaltyAmount) AS TotalPenalty
        FROM PenaltyData
        WHERE
            (:ZoneId IS NULL OR gclZone_FRK = :ZoneId)
            AND (:StreetId IS NULL OR gclStreet_FRK = :StreetId)
            AND (:UnitId IS NULL OR gclUnit_FRK = :UnitId);
            -- BuildingId is omitted here as it's not present in your DashboardFilters schema
    """)
    
    # --- 3. Execute Query with Bound Parameters ---
    try:
        # Define the parameter dictionary for SQLAlchemy
        params = {
            'start_date': start_date,
            'end_date': end_date,
            'ZoneId': filters.zone_id,
            'StreetId': filters.street_id,
            'UnitId': filters.unit_id,
        }
        
        result = db.execute(penalty_query, params).scalar_one()
        return Decimal(str(result)) if result is not None else Decimal("0.00")
    except Exception as e:
        # Re-raise with context to be caught by asyncio.gather
        raise Exception(f"SLA Penalty Calculation Failed: {e}")

# --- 5. Main Aggregation Function (Concurrent Execution) ---

async def get_dashboard_data(db: Session, filters: DashboardFilters) -> DashboardKPIs:
    
    static_kpis = get_static_kpis(db)
    
    # Define the asynchronous tasks for dynamic KPIs 
    tasks = {
        'total_open_incidents': calculate_open_incidents(db, filters),
        'total_closed_incidents': calculate_closed_incidents(db, filters),
        'total_penalty': calculate_penalty(db, filters), 
    }

    # Execute all tasks concurrently and catch exceptions
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)

    # Process results and handle errors gracefully
    kpi_data = {}
    errors = {}
    keys = list(tasks.keys())
    
    for key, result in zip(keys, results):
        if isinstance(result, Exception):
            print(f"Error calculating KPI '{key}': {result}")
            errors[key] = str(result)
            kpi_data[key] = Decimal('0.00') if key == 'total_penalty' else 0
        else:
            kpi_data[key] = result
            
    # Combine all data into the final schema
    return DashboardKPIs(
        **static_kpis, 
        **kpi_data, 
        error_details=errors
    )