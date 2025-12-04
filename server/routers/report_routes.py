# routers/report_routes.py
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from datetime import datetime
from fastapi.responses import StreamingResponse
import io
import csv
from database import get_db
from schemas import DashboardFilters, ReportResponse, ReportRow
from services import report_data_service

router = APIRouter(
    prefix="/api/report",
    tags=["Report Data"]
)

@router.get("/", response_model=ReportResponse, status_code=status.HTTP_200_OK)
def get_report_data(
    db: Session = Depends(get_db),
    
    # Use the same filters as the dashboard
    zone_id: Optional[List[int]] = Query(None),
    street_id: Optional[List[int]] = Query(None),
    unit_id: Optional[List[int]] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    skip: int = Query(0, ge=0, description="The number of records to skip for pagination."),
    limit: int = Query(500, ge=1, le=1000, description="The maximum number of records to return (page size)."),
):
    """Retrieves detailed device downtime and penalty data for the report table."""
    
    filters = DashboardFilters(
        zone_id=zone_id, street_id=street_id, unit_id=unit_id,
        date_from=date_from, date_to=date_to,
        skip=skip, limit=limit, 
    )
    
    return report_data_service.get_detailed_report(db, filters)

def convert_report_to_csv(report_data: List[ReportRow]) -> io.StringIO:
    """Converts a list of ReportRow Pydantic models to a CSV format string."""
    output = io.StringIO()
    writer = csv.writer(output)

    if not report_data:
        writer.writerow(['No Data Found'])
        return output

    # Write header (keys of the first row object)
    header = [
        'NVR_PRK', 'nvrAlias_TXT', 'nvrIPAddress_TXT', 'Camera_PRK', 'camName_TXT', 
        'gclZone_FRK', 'ZoneName', 'gclStreet_FRK', 'StreetName', 'gclBuilding_FRK', 
        'BuildingName', 'gclUnit_FRK', 'UnitName', 'OfflineTime', 'OnlineTime', 
        'OfflineMinutes', 'PenaltyAmount'
    ]
    writer.writerow(header)


    # Write data rows
    for row in report_data:
        # Manually map to the required columns
        row_dict = row.model_dump()
        writer.writerow([
            row_dict.get('NVR_PRK'), row_dict.get('nvrAlias_TXT'), row_dict.get('nvrIPAddress_TXT'), 
            row_dict.get('Camera_PRK'), row_dict.get('camName_TXT'), row_dict.get('gclZone_FRK'), 
            row_dict.get('ZoneName'), row_dict.get('gclStreet_FRK'), row_dict.get('StreetName'), 
            row_dict.get('gclBuilding_FRK'), row_dict.get('BuildingName'), row_dict.get('gclUnit_FRK'), 
            row_dict.get('UnitName'), row_dict.get('OfflineTime'), row_dict.get('OnlineTime'), 
            row_dict.get('OfflineMinutes'), row_dict.get('PenaltyAmount')
        ])
        
    output.seek(0)
    return output


@router.get("/download", status_code=status.HTTP_200_OK)
def download_report(
    db: Session = Depends(get_db),
    
    # Use the same query parameters for filtering
    zone_id: Optional[List[int]] = Query(None),
    street_id: Optional[List[int]] = Query(None),
    unit_id: Optional[List[int]] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
):
    """Generates and streams the detailed report data as a CSV file."""
    
    filters = DashboardFilters(
        zone_id=zone_id, street_id=street_id, unit_id=unit_id,
        date_from=date_from, date_to=date_to,
        # FIX: Explicitly set a high limit (e.g., 500,000) to ensure ALL filtered data is fetched
        limit=500000,
    )
    
    # Get the detailed report data
    report_response = report_data_service.get_detailed_report(db, filters)
    
    # Convert ReportRow objects to CSV format
    csv_stream = convert_report_to_csv(report_response.data)

    # Create the StreamingResponse
    return StreamingResponse(
        csv_stream,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=sla_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
        }
    )