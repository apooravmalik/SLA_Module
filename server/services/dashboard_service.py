# services/dashboard_service.py (FINAL COMPLETE VERSION)
import asyncio
from typing import Dict, Optional, List
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta
from schemas import DashboardKPIs, DashboardFilters
import re

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
# 🔥 FINAL: SLA Penalty Calculation (Matches Working SQL)
# ------------------------------------------------------
async def calculate_penalty(db: Session, filters: DashboardFilters) -> Decimal:
    await asyncio.sleep(0.05)

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

    # ---------- Filter Lists (for STRING_SPLIT) ----------
    zone_list = ",".join(str(z) for z in filters.zone_id) if filters.zone_id else ""
    street_list = ",".join(str(s) for s in filters.street_id) if filters.street_id else ""
    unit_list = ",".join(str(u) for u in filters.unit_id) if filters.unit_id else ""

    params = {
        "start_date": start_date,
        "end_date": end_date,
        "zone_list": zone_list,
        "street_list": street_list,
        "unit_list": unit_list,
    }

    # ---------- FULL SQL (NEW ROBUST LOGIC) ----------
    penalty_sql = text(f"""
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

            -- Latest disconnect inside the period
            OUTER APPLY (
                SELECT TOP (1)
                    il.inlDateTime_DTM AS OfflineTime
                FROM {DB_SCHEMA}.IncidentLog_TBL il
                WHERE il.inlSourceDevice_FRK = cam.Camera_PRK
                  AND il.inlDateTime_DTM >= :start_date
                  AND il.inlDateTime_DTM < :end_date
                  AND il.inlAlarmMessage_TXT LIKE '%Channel disconnect%'
                ORDER BY il.inlDateTime_DTM DESC
            ) lo

            -- First recovery after that disconnect (within period window; may be NULL)
            OUTER APPLY (
                SELECT TOP (1)
                    il2.inlDateTime_DTM AS OnlineTime
                FROM {DB_SCHEMA}.IncidentLog_TBL il2
                WHERE il2.inlSourceDevice_FRK = cam.Camera_PRK
                  AND il2.inlDateTime_DTM >= :start_date
                  AND il2.inlDateTime_DTM < :end_date
                  AND il2.inlAlarmMessage_TXT LIKE '%Channel connected%'
                  AND lo.OfflineTime IS NOT NULL
                  AND il2.inlDateTime_DTM > lo.OfflineTime
                ORDER BY il2.inlDateTime_DTM ASC
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

        SELECT SUM(PenaltyAmount) AS TotalPenalty
        FROM PenaltyBase
        WHERE 
            ( COALESCE(:zone_list, '') = '' 
              OR gclZone_FRK IN (SELECT TRIM([value]) FROM STRING_SPLIT(:zone_list, ',')) ) -- FIXED: Removed gr.

          AND ( COALESCE(:street_list, '') = '' 
              OR gclStreet_FRK IN (SELECT TRIM([value]) FROM STRING_SPLIT(:street_list, ',')) ) -- FIXED: Removed gr.

          AND ( COALESCE(:unit_list, '') = '' 
              OR gclUnit_FRK IN (SELECT TRIM([value]) FROM STRING_SPLIT(:unit_list, ',')) ); -- FIXED: Removed gr.
    """)

    # Debug log
    print("\n--- SLA PENALTY SQL (EXECUTED) ---")
    print(substitute_params(penalty_sql.text, params))
    print("----------------------------------\n")

    result = db.execute(penalty_sql, params).scalar_one()
    return Decimal(str(result)) if result else Decimal("0")


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

    return DashboardKPIs(**static_kpis, **output, error_details=errors)
