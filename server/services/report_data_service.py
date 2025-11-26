# services/report_data_service.py (FIXED for Multi-Select)
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta
from schemas import DashboardFilters, ReportRow, ReportResponse
from typing import Optional, List

DB_SCHEMA = "dbo"


def build_in_clause_params(filter_list: Optional[List[int]], column_name: str, param_prefix: str) -> tuple[str, dict]:
    """
    Converts a list of IDs into SQL IN clause with individual parameters.
    Returns: (SQL_clause, parameter_dict)
    
    Example:
        Input: [1, 2, 3], "g.gclZone_FRK", "zone"
        Output: ("g.gclZone_FRK IN (:zone_0, :zone_1, :zone_2)", {"zone_0": 1, "zone_1": 2, "zone_2": 3})
    """
    if not filter_list:
        return "1=1", {}  # Always true if no filter
    
    param_names = [f"{param_prefix}_{i}" for i in range(len(filter_list))]
    params_dict = {name: value for name, value in zip(param_names, filter_list)}
    in_clause = f"{column_name} IN ({', '.join(':' + name for name in param_names)})"
    
    return in_clause, params_dict


def get_detailed_report(db: Session, filters: DashboardFilters) -> ReportResponse:
    """
    Generates detailed report with device downtime and penalties.
    Supports multi-select filters for Zone, Street, and Unit.
    """
    
    # 1. Determine Dynamic Start/End Dates
    end_date = filters.date_to if filters.date_to else datetime.now()
    start_date = filters.date_from if filters.date_from else end_date - timedelta(hours=24)
    
    # 2. Build dynamic WHERE clauses for geographic filters
    # Handle empty lists - if all filters are empty, return all data
    zone_where, zone_params = build_in_clause_params(filters.zone_id, "g.gclZone_FRK", "zone")
    street_where, street_params = build_in_clause_params(filters.street_id, "g.gclStreet_FRK", "street")
    unit_where, unit_params = build_in_clause_params(filters.unit_id, "g.gclUnit_FRK", "unit")
    
    # 3. Combine all parameters
    all_params = {
        'start_date': start_date,
        'end_date': end_date,
    }
    all_params.update(zone_params)
    all_params.update(street_params)
    all_params.update(unit_params)
    
    # 4. SQL Query with Dynamic WHERE Clauses
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
        LEFT JOIN {DB_SCHEMA}.Unit_TBL u ON u.Unit_PRK = g.gclUnit_FRK
        LEFT JOIN {DB_SCHEMA}.Building_TBL b ON b.Building_PRK = g.gclBuilding_FRK 
        LEFT JOIN LatestOffline lo ON lo.Device_PRK = cam.Camera_PRK
        LEFT JOIN LatestOnline lon ON lon.Device_PRK = cam.Camera_PRK
        WHERE {zone_where}
          AND {street_where}
          AND {unit_where}
        ORDER BY
            n.NVR_PRK, cam.Camera_PRK;
    """)

    try:
        # 5. Execute Query with Bound Parameters
        result = db.execute(report_query, all_params).mappings().all()
        
        # 6. Map results to Pydantic schema
        report_data = [ReportRow(**dict(row)) for row in result]

        return ReportResponse(
            total_rows=len(report_data),
            data=report_data
        )
    except Exception as e:
        # Log the error for debugging
        print(f"Report query failed: {e}")
        print(f"Filters: {filters}")
        print(f"Query params: {all_params}")
        
        # Return empty result instead of raising exception
        return ReportResponse(
            total_rows=0,
            data=[]
        )