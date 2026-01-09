# services/report_data_service.py
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta
from schemas import DashboardFilters, ReportRow, ReportResponse
from typing import Optional, List
from decimal import Decimal
import re

from services import cache_data_service

DB_SCHEMA = "dbo"


# ---------------------------------------------------------------
# Helper: Substitute parameters into SQL for debugging
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
# Main Report Function
# ---------------------------------------------------------------
def get_detailed_report(db: Session, filters: DashboardFilters) -> ReportResponse:

    # -----------------------------------------------------------
    # DATE LOGIC (RETAINS CURRENT FUNCTIONALITY)
    # -----------------------------------------------------------
    has_valid_from = filters.date_from not in (None, "", " ")
    has_valid_to   = filters.date_to   not in (None, "", " ")

    if has_valid_from and has_valid_to:
        start_date = filters.date_from
        end_date = filters.date_to

    else:
        # Previous-month logic (MUST match dashboard default)
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

        first_day_this_month = today.replace(day=1)
        last_day_prev_month = first_day_this_month - timedelta(days=1)
        first_day_prev_month = last_day_prev_month.replace(day=1)

        start_date = first_day_prev_month
        end_date = first_day_this_month

    print("\n🟩 REPORT DATE RANGE ---------------------------")
    print("START DATE =", start_date)
    print("END DATE   =", end_date)
    print("SKIP =", filters.skip)
    print("LIMIT =", filters.limit)
    print("------------------------------------------------\n")

    # 🔥 ENHANCED: Check cache and regenerate if needed
    duckdb_file_path = cache_data_service.get_duckdb_file_path(start_date)
    
    # Check if cache is stale OR if table doesn't exist
    needs_regeneration = (
        cache_data_service.is_duckdb_file_stale(duckdb_file_path) or 
        not cache_data_service.table_exists_in_cache(duckdb_file_path)
    )
    
    if needs_regeneration:
        print(f"🔄 Cache needs regeneration for {start_date.strftime('%Y-%m')}...")
        try:
            cache_data_service.regenerate_duckdb_cache(db, start_date, end_date)
        except Exception as e:
            print(f"❌ Cache regeneration failed: {e}")
            return ReportResponse(total_rows=0, data=[])

    # Query data from DuckDB cache
    return cache_data_service.query_cached_report_data(start_date, filters)


# ---------------------------------------------------------------
# New function to get Incident SubCategories for waiver dropdown
# ---------------------------------------------------------------
def get_incident_sub_categories(db: Session) -> List[dict]:
    """Fetches Incident SubCategories from the production database."""
    query = text(f"SELECT IncidentSubCategory_PRK AS id, iscName_TXT AS name FROM {DB_SCHEMA}.IncidentSubCategory_TBL;")
    result = db.execute(query).mappings().all()
    return [dict(row) for row in result]