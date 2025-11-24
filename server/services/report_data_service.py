# services/report_data_service.py
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Dict, Any
from schemas import DashboardFilters, ReportRow, ReportResponse

DB_SCHEMA = "dbo"

def get_detailed_report(db: Session, filters: DashboardFilters) -> ReportResponse:
    
    # 1. Determine Dynamic Start/End Dates
    end_date = filters.date_to if filters.date_to else datetime.now()
    start_date = filters.date_from if filters.date_from else end_date - timedelta(hours=24)
    
    # 2. SQL Query with Bound Parameters (Your full query)
    report_query = text(f"""
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
        )
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
            b.bldBuildingName_TXT AS BuildingName, -- Assuming BuildingName comes from a Building_TBL or similar
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
        LEFT JOIN {DB_SCHEMA}.Unit_TBL u ON u.Unit_PRK = g.gclUnit_FRK
        LEFT JOIN {DB_SCHEMA}.Building_TBL b ON b.Building_PRK = g.gclBuilding_FRK -- Added Building join
        LEFT JOIN LatestOffline lo ON lo.Device_PRK = cam.Camera_PRK
        LEFT JOIN LatestOnline lon ON lon.Device_PRK = cam.Camera_PRK
        WHERE
            (:ZoneId IS NULL OR g.gclZone_FRK = :ZoneId)
            AND (:StreetId IS NULL OR g.gclStreet_FRK = :StreetId)
            AND (:UnitId IS NULL OR g.gclUnit_FRK = :UnitId)
        ORDER BY
            n.NVR_PRK, cam.Camera_PRK;
    """)

    # 3. Execute Query with Bound Parameters
    params = {
        'start_date': start_date,
        'end_date': end_date,
        'ZoneId': filters.zone_id,
        'StreetId': filters.street_id,
        'UnitId': filters.unit_id,
    }
    
    result = db.execute(report_query, params).mappings().all()
    
    # 4. Map results to Pydantic schema
    report_data = [ReportRow(**dict(row)) for row in result]

    return ReportResponse(
        total_rows=len(report_data),
        data=report_data
    )