# services/dashboard_service.py (FIXED for Multi-Select)
import asyncio
from typing import Dict, Any, Optional, List
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta
from schemas import DashboardFilters, DashboardKPIs

DB_SCHEMA = "dbo"
STATUS_OPEN_FK = 1
STATUS_CLOSED_FK = 2

# --- Helper: Build SQL IN Clause with Dynamic Parameters ---
def build_in_clause_params(filter_list: Optional[List[int]], column_name: str, param_prefix: str) -> tuple[str, dict]:
    """
    Converts a list of IDs into SQL IN clause with individual parameters.
    Returns: (SQL_clause, parameter_dict)
    
    Example:
        Input: [1, 2, 3], "gclZone_FRK", "zone"
        Output: ("gclZone_FRK IN (:zone_0, :zone_1, :zone_2)", {"zone_0": 1, "zone_1": 2, "zone_2": 3})
    """
    if not filter_list:
        return "1=1", {}  # Always true if no filter
    
    param_names = [f"{param_prefix}_{i}" for i in range(len(filter_list))]
    params_dict = {name: value for name, value in zip(param_names, filter_list)}
    in_clause = f"{column_name} IN ({', '.join(':' + name for name in param_names)})"
    
    return in_clause, params_dict


# --- 1. Raw SQL Execution Helper ---
def execute_count_query(db: Session, table_name: str, conditions: Optional[str] = None, params: dict = None) -> int:
    """Executes a COUNT(*) query with optional WHERE clause conditions."""
    query_base = f"SELECT COUNT(*) FROM {DB_SCHEMA}.{table_name}"
    
    if conditions:
        query_sql = f"{query_base} WHERE {conditions}"
    else:
        query_sql = query_base
        
    try:
        if params:
            result = db.execute(text(query_sql), params).scalar_one()
        else:
            result = db.execute(text(query_sql)).scalar_one()
        return result if result is not None else 0
    except Exception as e:
        print(f"Database error executing count query for {table_name}: {e}")
        return 0


# --- 2. Filter Clause Builder (FIXED for Multi-Select) ---
def build_incident_filter_clause(filters: DashboardFilters, include_status: Optional[str] = None) -> tuple[str, dict]:
    """
    Builds the SQL WHERE clause for IncidentLog_TBL based on user filters.
    Returns: (where_clause, parameters_dict)
    """
    conditions = []
    all_params = {}
    
    # Zone Filter
    if filters.zone_id:
        zone_clause, zone_params = build_in_clause_params(filters.zone_id, "inlZone_FRK", "zone")
        conditions.append(zone_clause)
        all_params.update(zone_params)
    
    # Street Filter
    if filters.street_id:
        street_clause, street_params = build_in_clause_params(filters.street_id, "inlStreet_FRK", "street")
        conditions.append(street_clause)
        all_params.update(street_params)
    
    # Unit Filter
    if filters.unit_id:
        unit_clause, unit_params = build_in_clause_params(filters.unit_id, "inlUnit_FRK", "unit")
        conditions.append(unit_clause)
        all_params.update(unit_params)

    # Date filters
    if filters.date_from is not None:
        conditions.append("inlDateTime_DTM >= :date_from")
        all_params['date_from'] = filters.date_from
        
    if filters.date_to is not None:
        conditions.append("inlDateTime_DTM <= :date_to")
        all_params['date_to'] = filters.date_to

    # Specific Status Filter
    if include_status == 'Open':
        conditions.append(f"inlStatus_FRK = {STATUS_OPEN_FK}")
    elif include_status == 'Closed':
        conditions.append(f"inlStatus_FRK = {STATUS_CLOSED_FK}")

    where_clause = " AND ".join(conditions) if conditions else "1=1"
    return where_clause, all_params


# --- 3. Static KPI Calculation ---
def get_static_kpis(db: Session) -> Dict[str, int]:
    """Retrieves total counts for Zones, Streets, and Units (Non-Filtered)."""
    return {
        "total_zones": execute_count_query(db, "CameraZone_TBL"),
        "total_streets": execute_count_query(db, "Street_TBL"),
        "total_units": execute_count_query(db, "Unit_TBL"), 
    }


# --- 4. Asynchronous Dynamic KPI Calculations ---

async def calculate_open_incidents(db: Session, filters: DashboardFilters) -> int:
    """Calculates open incidents based on filters (Status_FRK = 1)."""
    await asyncio.sleep(0.01)
    filter_clause, params = build_incident_filter_clause(filters, include_status='Open')
    return execute_count_query(db, "IncidentLog_TBL", filter_clause, params)


async def calculate_closed_incidents(db: Session, filters: DashboardFilters) -> int:
    """Calculates closed incidents based on filters (Status_FRK = 2)."""
    await asyncio.sleep(0.01)
    filter_clause, params = build_incident_filter_clause(filters, include_status='Closed')
    return execute_count_query(db, "IncidentLog_TBL", filter_clause, params)


async def calculate_penalty(db: Session, filters: DashboardFilters) -> Decimal:
    """
    Executes the complex SLA penalty calculation query using dynamic parameter binding.
    """
    await asyncio.sleep(0.3) 

    # Determine Dynamic Start/End Dates
    end_date = filters.date_to if filters.date_to else datetime.now()
    start_date = filters.date_from if filters.date_from else end_date - timedelta(hours=24)
    
    # Build dynamic WHERE clauses for geographic filters
    zone_where, zone_params = build_in_clause_params(filters.zone_id, "gclZone_FRK", "zone")
    street_where, street_params = build_in_clause_params(filters.street_id, "gclStreet_FRK", "street")
    unit_where, unit_params = build_in_clause_params(filters.unit_id, "gclUnit_FRK", "unit")
    
    # Combine all parameters
    all_params = {
        'start_date': start_date,
        'end_date': end_date,
    }
    all_params.update(zone_params)
    all_params.update(street_params)
    all_params.update(unit_params)
    
    # The Integrated SQL Query with Dynamic WHERE Clauses
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
        WHERE {zone_where}
          AND {street_where}
          AND {unit_where};
    """)
    
    try:
        result = db.execute(penalty_query, all_params).scalar_one()
        return Decimal(str(result)) if result is not None else Decimal("0.00")
    except Exception as e:
        raise Exception(f"SLA Penalty Calculation Failed: {e}")


# --- 5. Main Aggregation Function ---

async def get_dashboard_data(db: Session, filters: DashboardFilters) -> DashboardKPIs:
    """Main function to aggregate all KPIs with error handling."""
    
    static_kpis = get_static_kpis(db)
    
    tasks = {
        'total_open_incidents': calculate_open_incidents(db, filters),
        'total_closed_incidents': calculate_closed_incidents(db, filters),
        'total_penalty': calculate_penalty(db, filters), 
    }

    results = await asyncio.gather(*tasks.values(), return_exceptions=True)

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
            
    return DashboardKPIs(
        **static_kpis, 
        **kpi_data, 
        error_details=errors
    )