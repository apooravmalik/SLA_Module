# services/dashboard_service.py (FINAL COMPLETE VERSION)
import asyncio
from typing import Dict, Optional, List
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta
from schemas import DashboardKPIs, DashboardFilters
import re
import duckdb
import os
from services import cache_data_service

DB_SCHEMA = "dbo"
STATUS_OPEN_FK = 1
STATUS_CLOSED_FK = 2

# ------------------------------------------------------
# Helper: Substitute parameters into SQL for readable debug
# ------------------------------------------------------
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


# ------------------------------------------------------
# Helper: Build Incident Filter Clause
# ------------------------------------------------------
def build_in_clause_params(filter_list: Optional[List[int]], column_name: str, param_prefix: str):
    if not filter_list:
        return "1=1", {}

    param_map = {}
    placeholders = []
    for idx, val in enumerate(filter_list):
        pname = f"{param_prefix}_{idx}"
        placeholders.append(f":{pname}")
        param_map[pname] = val

    sql = f"{column_name} IN ({','.join(placeholders)})"
    return sql, param_map


def build_incident_filter_clause(filters: DashboardFilters, include_status: Optional[str] = None):
    conditions = []
    params = {}

    # Zones
    if filters.zone_id:
        clause, p = build_in_clause_params(filters.zone_id, "inlZone_FRK", "zone")
        conditions.append(clause)
        params.update(p)

    # Streets
    if filters.street_id:
        clause, p = build_in_clause_params(filters.street_id, "inlStreet_FRK", "street")
        conditions.append(clause)
        params.update(p)

    # Units
    if filters.unit_id:
        clause, p = build_in_clause_params(filters.unit_id, "inlUnit_FRK", "unit")
        conditions.append(clause)
        params.update(p)

    # Date Filtering
    if filters.date_from:
        conditions.append("inlDateTime_DTM >= :date_from")
        params["date_from"] = filters.date_from

    if filters.date_to:
        conditions.append("inlDateTime_DTM <= :date_to")
        params["date_to"] = filters.date_to

    # Open / Closed
    if include_status == "Open":
        conditions.append("inlStatus_FRK = 1")
    if include_status == "Closed":
        conditions.append("inlStatus_FRK = 2")

    return " AND ".join(conditions) if conditions else "1=1", params


# ------------------------------------------------------
# Generic Count Query
# ------------------------------------------------------
def execute_count_query(db: Session, table: str, where: Optional[str], params: dict):
    sql = f"SELECT COUNT(*) FROM {DB_SCHEMA}.{table}"
    if where:
        sql += f" WHERE {where}"

    try:
        return db.execute(text(sql), params).scalar_one() or 0
    except:
        return 0


# ------------------------------------------------------
# Static KPIs
# ------------------------------------------------------
def get_static_kpis(db: Session):
    return {
        "total_zones": execute_count_query(db, "CameraZone_TBL", None, {}),
        "total_streets": execute_count_query(db, "Street_TBL", None, {}),
        "total_units": execute_count_query(db, "Unit_TBL", None, {}),
    }


# ------------------------------------------------------
# Open / Closed Incident Counters
# ------------------------------------------------------
async def calculate_open_incidents(db: Session, filters: DashboardFilters):
    await asyncio.sleep(0.01)
    where, params = build_incident_filter_clause(filters, "Open")
    return execute_count_query(db, "IncidentLog_TBL", where, params)


async def calculate_closed_incidents(db: Session, filters: DashboardFilters):
    await asyncio.sleep(0.01)
    where, params = build_incident_filter_clause(filters, "Closed")
    return execute_count_query(db, "IncidentLog_TBL", where, params)


# ------------------------------------------------------
# 🔥 FINAL: SLA Penalty Calculation (Uses DuckDB Cache)
# ------------------------------------------------------
async def calculate_penalty(db: Session, filters: DashboardFilters) -> Decimal:
    await asyncio.sleep(0.01)  # Reduced since we're using cache now

    # ---------- DATE LOGIC ----------
    if filters.date_from and filters.date_to:
        start_date = filters.date_from
        end_date = filters.date_to
    else:
        now = datetime.now()
        first_day_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_day_prev_month = first_day_this_month - timedelta(days=1)
        first_day_prev_month = last_day_prev_month.replace(day=1)

        start_date = first_day_prev_month
        end_date = first_day_this_month

    # Ensure cache exists and is up-to-date
    duckdb_file_path = cache_data_service.get_duckdb_file_path(start_date)
    if cache_data_service.is_duckdb_file_stale(duckdb_file_path) or not os.path.exists(duckdb_file_path):
        # Regenerate cache if missing or stale
        cache_data_service.regenerate_duckdb_cache(db, start_date, end_date)

    # Query DuckDB cache for penalty calculation
    if not os.path.exists(duckdb_file_path):
        # If cache still doesn't exist after regeneration attempt, return 0
        print(f"⚠️ WARNING: DuckDB cache file not found: {duckdb_file_path}")
        return Decimal("0")

    # Build filter conditions for DuckDB (DuckDB uses positional parameters, so we'll build the IN clause directly)
    where_clauses = []
    
    # Build zone filter
    if filters.zone_id:
        zone_ids = ",".join(str(z) for z in filters.zone_id)
        where_clauses.append(f"gclZone_FRK IN ({zone_ids})")
    
    # Build street filter
    if filters.street_id:
        street_ids = ",".join(str(s) for s in filters.street_id)
        where_clauses.append(f"gclStreet_FRK IN ({street_ids})")
    
    # Build unit filter
    if filters.unit_id:
        unit_ids = ",".join(str(u) for u in filters.unit_id)
        where_clauses.append(f"gclUnit_FRK IN ({unit_ids})")
    
    combined_where_clause = " AND ".join(where_clauses) if where_clauses else "1=1"

    # Query DuckDB to calculate SUM(PenaltyAmount) with filters applied
    with duckdb.connect(database=duckdb_file_path, read_only=True) as con:
        penalty_query = f"""
            SELECT COALESCE(SUM(PenaltyAmount), 0) AS TotalPenalty
            FROM cached_report_data
            WHERE {combined_where_clause};
        """
        
        result = con.execute(penalty_query).fetchone()
        total_penalty = result[0] if result and result[0] is not None else 0.0

    print(f"\n--- DASHBOARD PENALTY (FROM DUCKDB CACHE) ---")
    print(f"Total Penalty: {total_penalty}")
    print(f"Filters applied: Zone={filters.zone_id}, Street={filters.street_id}, Unit={filters.unit_id}")
    print("--------------------------------------------\n")

    return Decimal(str(total_penalty))


# ------------------------------------------------------
# Dashboard Aggregate
# ------------------------------------------------------
async def get_dashboard_data(db: Session, filters: DashboardFilters) -> DashboardKPIs:
    static_kpis = get_static_kpis(db)

    tasks = {
        "total_open_incidents": calculate_open_incidents(db, filters),
        "total_closed_incidents": calculate_closed_incidents(db, filters),
        "total_penalty": calculate_penalty(db, filters),
    }

    results = await asyncio.gather(*tasks.values(), return_exceptions=True)

    output = {}
    errors = {}

    for key, val in zip(tasks.keys(), results):
        if isinstance(val, Exception):
            output[key] = 0
            errors[key] = str(val)
        else:
            output[key] = val

    return DashboardKPIs(**static_kpis, **output, rows=[],  error_details=errors)
