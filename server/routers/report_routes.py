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
    zone_id: Optional[int] = Query(None),
    street_id: Optional[int] = Query(None),
    unit_id: Optional[int] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
):
    """Retrieves detailed device downtime and penalty data for the report table."""
    
    filters = DashboardFilters(
        zone_id=zone_id, street_id=street_id, unit_id=unit_id,
        date_from=date_from, date_to=date_to,
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
    header = report_data[0].model_dump().keys()
    writer.writerow(header)

    # Write data rows
    for row in report_data:
        # Pydantic's model_dump() handles converting Decimal/datetime to basic types
        writer.writerow(row.model_dump().values())
        
    output.seek(0)
    return output


@router.get("/download", status_code=status.HTTP_200_OK)
def download_report(
    db: Session = Depends(get_db),
    
    # Use the same query parameters for filtering
    zone_id: Optional[int] = Query(None),
    street_id: Optional[int] = Query(None),
    unit_id: Optional[int] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
):
    """Generates and streams the detailed report data as a CSV file."""
    
    filters = DashboardFilters(
        zone_id=zone_id, street_id=street_id, unit_id=unit_id,
        date_from=date_from, date_to=date_to,
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