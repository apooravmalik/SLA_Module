# services/report_data_service.py (FINAL FIXED VERSION)
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta
from schemas import DashboardFilters, ReportRow, ReportResponse
from typing import Optional, List
from decimal import Decimal
import re

DB_SCHEMA = "dbo"


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
    clause = f"{column_name} IN ({', '.join(':' + name for name in names)})"

    return clause, params


# ---------------------------------------------------------------
# Main Report Function
# ---------------------------------------------------------------
def get_detailed_report(db: Session, filters: DashboardFilters) -> ReportResponse:

    # -----------------------------------------------------------
    # FIXED DATE LOGIC — SAME AS WORKING MSSQL QUERY
    # -----------------------------------------------------------
    has_valid_from = filters.date_from not in (None, "", " ")
    has_valid_to   = filters.date_to   not in (None, "", " ")

    if has_valid_from and has_valid_to:
        start_date = filters.date_from
        end_date = filters.date_to

    else:
        # Previous-month logic (MUST match dashboard)
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

        first_day_this_month = today.replace(day=1)
        last_day_prev_month = first_day_this_month - timedelta(days=1)
        first_day_prev_month = last_day_prev_month.replace(day=1)

        start_date = first_day_prev_month
        end_date = first_day_this_month

    print("\n🟩 REPORT DATE RANGE ---------------------------")
    print("START DATE =", start_date)
    print("END DATE   =", end_date)
    print("------------------------------------------------\n")

    # -----------------------------------------------------------
    # Dynamic Filters (Zone / Street / Unit)
    # -----------------------------------------------------------
    zone_where, zone_params = build_in_clause_params(filters.zone_id, "gclZone_FRK", "zone")
    street_where, street_params = build_in_clause_params(filters.street_id, "gclStreet_FRK", "street")
    unit_where, unit_params = build_in_clause_params(filters.unit_id, "gclUnit_FRK", "unit")


    params = {
        "start_date": start_date,
        "end_date": end_date,
        **zone_params,
        **street_params,
        **unit_params
    }

    # -----------------------------------------------------------
    # FINAL SQL (IDENTICAL to working dashboard SQL)
    # -----------------------------------------------------------
    sql = text(f"""
        WITH MonthData AS (
            SELECT *
            FROM IncidentLog_TBL
            WHERE 
                inlDateTime_DTM >= DATEFROMPARTS(
                                        YEAR(DATEADD(MONTH,-1,GETDATE())),
                                        MONTH(DATEADD(MONTH,-1,GETDATE())),
                                        1)
                AND inlDateTime_DTM < DATEFROMPARTS(
                                        YEAR(GETDATE()),
                                        MONTH(GETDATE()),
                                        1)
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
            WHERE inlAlarmMessage_TXT LIKE '%Channel disconnect%'
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
            WHERE m.inlAlarmMessage_TXT LIKE '%Channel connected%'
        ),

        PenaltyBase AS (
            SELECT
                n.NVR_PRK,
                n.nvrAlias_TXT,
                n.nvrIPAddress_TXT,

                cam.Camera_PRK,
                cam.camName_TXT,

                g.gclZone_FRK,
                z.cznName_TXT AS ZoneName,

                g.gclStreet_FRK,
                s.strName_TXT AS StreetName,

                g.gclBuilding_FRK,
                b.bldBuildingName_TXT AS BuildingName,

                g.gclUnit_FRK,
                u.untUnitName_TXT AS UnitName,

                lo.OfflineTime,
                lon.OnlineTime,

                DATEDIFF(MINUTE, lo.OfflineTime, lon.OnlineTime) AS OfflineMinutes,

                CASE
                    WHEN DATEDIFF(MINUTE, lo.OfflineTime, lon.OnlineTime) >= 1440
                        THEN (DATEDIFF(MINUTE, lo.OfflineTime, lon.OnlineTime) / 1440) * 5
                    ELSE 0
                END AS PenaltyAmount

            FROM {DB_SCHEMA}.NVR_TBL n
            JOIN {DB_SCHEMA}.NVRChannel_TBL nc ON nc.nchNVR_FRK = n.NVR_PRK
            JOIN {DB_SCHEMA}.Camera_TBL cam ON cam.Camera_PRK = nc.nchCamera_FRK

            LEFT JOIN {DB_SCHEMA}.GeoRollupCameraLink_TBL g ON g.gclCamera_FRK = cam.Camera_PRK
            LEFT JOIN {DB_SCHEMA}.CameraZone_TBL z ON z.CameraZone_PRK = g.gclZone_FRK
            LEFT JOIN {DB_SCHEMA}.Street_TBL s ON s.Street_PRK = g.gclStreet_FRK
            LEFT JOIN {DB_SCHEMA}.Building_TBL b ON b.Building_PRK = g.gclBuilding_FRK
            LEFT JOIN {DB_SCHEMA}.Unit_TBL u ON u.Unit_PRK = g.gclUnit_FRK

            LEFT JOIN LatestOffline lo ON lo.Device_PRK = cam.Camera_PRK
            LEFT JOIN LatestOnline lon ON lon.Device_PRK = cam.Camera_PRK
        )

        SELECT *
        FROM PenaltyBase
        WHERE {zone_where}
          AND {street_where}
          AND {unit_where}
        ORDER BY NVR_PRK, Camera_PRK;
    """)

    # -----------------------------------------------------------
    # DEBUG PRINT
    # -----------------------------------------------------------
    print("\n--- EXECUTABLE REPORT QUERY (FINAL) ---")
    print(substitute_params(sql.text, params))
    print("------------------------------------------------------------\n")

    try:
        rows = db.execute(sql, params).mappings().all()
        data = [ReportRow(**dict(r)) for r in rows]

        return ReportResponse(total_rows=len(data), data=data)

    except Exception as e:
        print(f"❌ ERROR EXECUTING REPORT QUERY: {e}")
        return ReportResponse(total_rows=0, data=[])
