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
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet

router = APIRouter(
    prefix="/api/report",
    tags=["Report Data"]
)

@router.get("/incident_sub_categories", response_model=List[dict])
def get_incident_sub_categories(
    db: Session = Depends(get_db)
):
    """Fetches incident subcategories for the waiver dropdown."""
    return report_data_service.get_incident_sub_categories(db)

@router.get("/", response_model=ReportResponse)
def get_report_data(
    db: Session = Depends(get_db),
    zone_id: Optional[List[int]] = Query(None),
    street_id: Optional[List[int]] = Query(None),
    unit_id: Optional[List[int]] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    skip: int = Query(0),
    limit: int = Query(10000),
):
    filters = DashboardFilters(
        zone_id=zone_id,
        street_id=street_id,
        unit_id=unit_id,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
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

def convert_report_to_pdf(report_data: List[ReportRow]) -> io.BytesIO:
    """Converts a list of ReportRow Pydantic models to a PDF format using reportlab with a footer."""
    buffer = io.BytesIO()
    
    # Set up the document in landscape mode with increased bottom margin for footer
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=landscape(letter), 
        rightMargin=30, 
        leftMargin=30, 
        topMargin=30, 
        bottomMargin=50  # Space reserved for the footer text
    )
    elements = []
    styles = getSampleStyleSheet()

    # Footer function to be called on every page
    def draw_footer(canvas, doc):
        canvas.saveState()
        footer_text = ("This is a system-generated report. The contents are confidential and "
                       "intended for official use only. Unauthorized access or distribution is prohibited.")
        canvas.setFont('Helvetica', 8)
        # Center the text at the bottom of the page (Landscape width is approx 792 points)
        canvas.drawCentredString(landscape(letter)[0] / 2, 20, footer_text)
        canvas.restoreState()

    # Title
    elements.append(Paragraph(f"SLA Detailed Report - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", styles['Title']))

    if not report_data:
        elements.append(Paragraph("No Data Found", styles['Normal']))
    else:
        # Define Header and Data based on your requested labels
        header = [
            'NVR', 'Camera', 'Constintuencies', 'RWA', 'PKG', 
            'Offline Time', 'Online Time', 'Mins', 'Penalty'
        ]
        
        data = [header]
        for row in report_data:
            row_dict = row.model_dump()
            data.append([
                str(row_dict.get('nvrAlias_TXT') or ''),
                str(row_dict.get('camName_TXT') or ''),
                str(row_dict.get('ZoneName') or ''),
                str(row_dict.get('StreetName') or ''),
                str(row_dict.get('UnitName') or ''),
                row_dict.get('OfflineTime').strftime('%Y-%m-%d %H:%M') if row_dict.get('OfflineTime') else '',
                row_dict.get('OnlineTime').strftime('%Y-%m-%d %H:%M') if row_dict.get('OnlineTime') else '',
                str(row_dict.get('OfflineMinutes') or 0),
                f"{float(row_dict.get('PenaltyAmount') or 0):.2f}"
            ])

        # Create Table with Styling
        t = Table(data, repeatRows=1)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(t)

    # Build PDF applying footer to both the first page and all subsequent pages
    doc.build(elements, onFirstPage=draw_footer, onLaterPages=draw_footer)
    buffer.seek(0)
    return buffer

@router.get("/download-pdf", status_code=status.HTTP_200_OK)
def download_report_pdf(
    db: Session = Depends(get_db),
    zone_id: Optional[List[int]] = Query(None),
    street_id: Optional[List[int]] = Query(None),
    unit_id: Optional[List[int]] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
):
    """Generates and streams the detailed report data as a PDF file."""
    filters = DashboardFilters(
        zone_id=zone_id, street_id=street_id, unit_id=unit_id,
        date_from=date_from, date_to=date_to,
        limit=100000,
    )
    
    report_response = report_data_service.get_detailed_report(db, filters)
    pdf_stream = convert_report_to_pdf(report_response.data)

    return StreamingResponse(
        pdf_stream,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=sla_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf",
        }
    )