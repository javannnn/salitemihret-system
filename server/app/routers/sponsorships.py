import csv
import io
import re
import zipfile
from datetime import date
from decimal import Decimal
from typing import Iterable
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.sponsorship import Sponsorship
from app.models.user import User
from app.schemas.sponsorship import (
    SponsorshipCreate,
    SponsorshipBudgetRoundCreate,
    SponsorshipBudgetRoundOut,
    SponsorshipBudgetRoundUpdate,
    SponsorshipListResponse,
    SponsorshipMetrics,
    SponsorshipNoteCreate,
    SponsorshipNoteOut,
    SponsorshipNotesListResponse,
    SponsorshipOut,
    SponsorshipSponsorContext,
    SponsorshipStatusTransitionRequest,
    SponsorshipTimelineResponse,
    SponsorshipUpdate,
)
from app.services import sponsorships as sponsorships_service

router = APIRouter(prefix="/sponsorships", tags=["sponsorships"])

READ_ROLES = ("SponsorshipCommittee", "Admin", "FinanceAdmin", "OfficeAdmin", "PublicRelations")
MANAGE_ROLES = ("SponsorshipCommittee", "Admin")

SPONSORSHIP_EXPORT_HEADERS = [
    "case_id",
    "status",
    "sponsor_id",
    "sponsor_name",
    "sponsor_status",
    "beneficiary_type",
    "beneficiary_name",
    "beneficiary_member_id",
    "newcomer_id",
    "newcomer_county",
    "program",
    "frequency",
    "monthly_amount",
    "received_amount",
    "payment_information",
    "last_sponsored_date",
    "start_date",
    "end_date",
    "budget_month",
    "budget_year",
    "budget_round",
    "budget_slots",
    "used_slots",
    "assigned_staff_id",
    "created_at",
    "updated_at",
]
_ILLEGAL_XML_CHARS = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F]")


def _format_date(value: date | None) -> str:
    return value.isoformat() if value else ""


def _format_datetime(value) -> str:
    return value.isoformat() if value else ""


def _parse_selected_ids(ids: str | None) -> list[int] | None:
    if ids is None:
        return None
    parsed: list[int] = []
    for value in ids.split(","):
        stripped = value.strip()
        if not stripped:
            continue
        try:
            parsed.append(int(stripped))
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ids query parameter") from exc
    if not parsed:
        return None
    return sorted(set(parsed))


def _beneficiary_type(record: Sponsorship) -> str:
    if record.newcomer_id:
        return "Newcomer"
    if record.beneficiary_member_id:
        return "Member"
    return "External"


def _as_money(value) -> str:
    if value is None:
        return ""
    return f"{Decimal(value):.2f}"


def _format_sponsorship_row(record: Sponsorship) -> list[str]:
    sponsor = record.sponsor
    sponsor_name = ""
    sponsor_status = ""
    if sponsor:
        sponsor_name = f"{sponsor.first_name} {sponsor.last_name}".strip()
        sponsor_status = str(sponsor.status or "")
    county = ""
    if record.newcomer and record.newcomer.county:
        county = record.newcomer.county
    budget_round = ""
    if record.budget_round:
        budget_round = f"{record.budget_round.year}-R{record.budget_round.round_number}"
    return [
        str(record.id),
        str(record.status or ""),
        str(record.sponsor_member_id or ""),
        sponsor_name,
        sponsor_status,
        _beneficiary_type(record),
        str(record.beneficiary_name or ""),
        str(record.beneficiary_member_id or ""),
        str(record.newcomer_id or ""),
        county,
        str(record.program or ""),
        str(record.frequency or ""),
        _as_money(record.monthly_amount),
        _as_money(record.received_amount),
        str(record.payment_information or ""),
        _format_date(record.last_sponsored_date),
        _format_date(record.start_date),
        _format_date(record.end_date),
        str(record.budget_month or ""),
        str(record.budget_year or ""),
        budget_round,
        str(record.budget_slots or ""),
        str(record.used_slots or 0),
        str(record.assigned_staff_id or ""),
        _format_datetime(record.created_at),
        _format_datetime(record.updated_at),
    ]


def _stream_csv(rows: Iterable[list[str]]) -> Iterable[str]:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(SPONSORSHIP_EXPORT_HEADERS)
    yield buffer.getvalue()
    buffer.seek(0)
    buffer.truncate(0)
    for row in rows:
        writer.writerow(row)
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)


def _column_name(index: int) -> str:
    result = ""
    current = index + 1
    while current:
        current, remainder = divmod(current - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _xlsx_safe_text(value: str) -> str:
    return xml_escape(_ILLEGAL_XML_CHARS.sub("", value))


def _build_xlsx_bytes(headers: list[str], rows: Iterable[list[str]]) -> bytes:
    sheet_xml = io.StringIO()
    sheet_xml.write('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
    sheet_xml.write('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>')

    def write_row(row_index: int, values: list[str]) -> None:
        sheet_xml.write(f'<row r="{row_index}">')
        for column_index, value in enumerate(values):
            cell_ref = f"{_column_name(column_index)}{row_index}"
            safe_text = _xlsx_safe_text(str(value))
            sheet_xml.write(f'<c r="{cell_ref}" t="inlineStr"><is><t>{safe_text}</t></is></c>')
        sheet_xml.write("</row>")

    write_row(1, headers)
    for idx, row in enumerate(rows, start=2):
        write_row(idx, row)
    sheet_xml.write("</sheetData></worksheet>")

    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>
"""
    root_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
"""
    workbook_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sponsorships" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>
"""
    workbook_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>
"""

    output = io.BytesIO()
    with zipfile.ZipFile(output, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("xl/workbook.xml", workbook_xml)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml.getvalue())
    return output.getvalue()


@router.get("", response_model=SponsorshipListResponse, status_code=status.HTTP_200_OK)
def list_sponsorships(
    *,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    program: str | None = Query(None),
    sponsor_id: int | None = Query(None),
    newcomer_id: int | None = Query(None),
    frequency: str | None = Query(None),
    beneficiary_type: str | None = Query(None),
    county: str | None = Query(None),
    assigned_staff_id: int | None = Query(None),
    budget_month: int | None = Query(None, ge=1, le=12),
    budget_year: int | None = Query(None, ge=2000, le=2100),
    budget_round_id: int | None = Query(None),
    q: str | None = Query(None),
    has_newcomer: bool | None = Query(None, alias="has_newcomer"),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    created_from: date | None = Query(None),
    created_to: date | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
    ) -> SponsorshipListResponse:
    return sponsorships_service.list_sponsorships(
        db,
        page=page,
        page_size=page_size,
        status_filter=status_filter,
        program=program,
        sponsor_id=sponsor_id,
        newcomer_id=newcomer_id,
        frequency=frequency,
        beneficiary_type=beneficiary_type,
        county=county,
        assigned_staff_id=assigned_staff_id,
        budget_month=budget_month,
        budget_year=budget_year,
        budget_round_id=budget_round_id,
        search=q,
        has_newcomer=has_newcomer,
        start_date=start_date,
        end_date=end_date,
        created_from=created_from,
        created_to=created_to,
    )


@router.get("/export.csv", status_code=status.HTTP_200_OK)
@router.get("/export", status_code=status.HTTP_200_OK, include_in_schema=False)
def export_sponsorships_csv(
    *,
    status_filter: str | None = Query(None, alias="status"),
    program: str | None = Query(None),
    sponsor_id: int | None = Query(None),
    newcomer_id: int | None = Query(None),
    frequency: str | None = Query(None),
    beneficiary_type: str | None = Query(None),
    county: str | None = Query(None),
    assigned_staff_id: int | None = Query(None),
    budget_month: int | None = Query(None, ge=1, le=12),
    budget_year: int | None = Query(None, ge=2000, le=2100),
    budget_round_id: int | None = Query(None),
    q: str | None = Query(None),
    has_newcomer: bool | None = Query(None, alias="has_newcomer"),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    created_from: date | None = Query(None),
    created_to: date | None = Query(None),
    ids: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> StreamingResponse:
    selected_ids = _parse_selected_ids(ids)
    sponsorships = sponsorships_service.get_sponsorships_for_export(
        db,
        status_filter=status_filter,
        program=program,
        sponsor_id=sponsor_id,
        newcomer_id=newcomer_id,
        frequency=frequency,
        beneficiary_type=beneficiary_type,
        county=county,
        assigned_staff_id=assigned_staff_id,
        budget_month=budget_month,
        budget_year=budget_year,
        budget_round_id=budget_round_id,
        search=q,
        has_newcomer=has_newcomer,
        start_date=start_date,
        end_date=end_date,
        created_from=created_from,
        created_to=created_to,
        ids=selected_ids,
    )
    rows = (_format_sponsorship_row(record) for record in sponsorships)
    filename = "sponsorships_selected.csv" if selected_ids else "sponsorships_filtered.csv"
    response = StreamingResponse(_stream_csv(rows), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response


@router.get("/export.xlsx", status_code=status.HTTP_200_OK)
@router.get("/export/excel", status_code=status.HTTP_200_OK, include_in_schema=False)
def export_sponsorships_excel(
    *,
    status_filter: str | None = Query(None, alias="status"),
    program: str | None = Query(None),
    sponsor_id: int | None = Query(None),
    newcomer_id: int | None = Query(None),
    frequency: str | None = Query(None),
    beneficiary_type: str | None = Query(None),
    county: str | None = Query(None),
    assigned_staff_id: int | None = Query(None),
    budget_month: int | None = Query(None, ge=1, le=12),
    budget_year: int | None = Query(None, ge=2000, le=2100),
    budget_round_id: int | None = Query(None),
    q: str | None = Query(None),
    has_newcomer: bool | None = Query(None, alias="has_newcomer"),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    created_from: date | None = Query(None),
    created_to: date | None = Query(None),
    ids: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> Response:
    selected_ids = _parse_selected_ids(ids)
    sponsorships = sponsorships_service.get_sponsorships_for_export(
        db,
        status_filter=status_filter,
        program=program,
        sponsor_id=sponsor_id,
        newcomer_id=newcomer_id,
        frequency=frequency,
        beneficiary_type=beneficiary_type,
        county=county,
        assigned_staff_id=assigned_staff_id,
        budget_month=budget_month,
        budget_year=budget_year,
        budget_round_id=budget_round_id,
        search=q,
        has_newcomer=has_newcomer,
        start_date=start_date,
        end_date=end_date,
        created_from=created_from,
        created_to=created_to,
        ids=selected_ids,
    )
    rows = [_format_sponsorship_row(record) for record in sponsorships]
    content = _build_xlsx_bytes(SPONSORSHIP_EXPORT_HEADERS, rows)
    filename = "sponsorships_selected.xlsx" if selected_ids else "sponsorships_filtered.xlsx"
    response = Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response


@router.get("/metrics", response_model=SponsorshipMetrics, status_code=status.HTTP_200_OK)
def get_sponsorship_metrics(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> SponsorshipMetrics:
    return sponsorships_service.get_sponsorship_metrics(db, start_date=start_date, end_date=end_date)


@router.get("/budget-rounds", response_model=list[SponsorshipBudgetRoundOut], status_code=status.HTTP_200_OK)
def list_budget_rounds(
    year: int | None = Query(None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> list[SponsorshipBudgetRoundOut]:
    return sponsorships_service.list_budget_rounds(db, year=year)


@router.post("/budget-rounds", response_model=SponsorshipBudgetRoundOut, status_code=status.HTTP_201_CREATED)
def create_budget_round(
    payload: SponsorshipBudgetRoundCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*MANAGE_ROLES)),
) -> SponsorshipBudgetRoundOut:
    return sponsorships_service.create_budget_round(db, payload)


@router.patch("/budget-rounds/{round_id:int}", response_model=SponsorshipBudgetRoundOut, status_code=status.HTTP_200_OK)
def update_budget_round(
    round_id: int,
    payload: SponsorshipBudgetRoundUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*MANAGE_ROLES)),
) -> SponsorshipBudgetRoundOut:
    return sponsorships_service.update_budget_round(db, round_id, payload)


@router.delete("/budget-rounds/{round_id:int}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget_round(
    round_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*MANAGE_ROLES)),
) -> None:
    sponsorships_service.delete_budget_round(db, round_id)


@router.get("/sponsors/{member_id:int}/context", response_model=SponsorshipSponsorContext, status_code=status.HTTP_200_OK)
def get_sponsor_context(
    member_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> SponsorshipSponsorContext:
    return sponsorships_service.get_sponsor_context(db, member_id)


@router.post("", response_model=SponsorshipOut, status_code=status.HTTP_201_CREATED)
def create_sponsorship(
    payload: SponsorshipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*MANAGE_ROLES)),
) -> SponsorshipOut:
    return sponsorships_service.create_sponsorship(db, payload, current_user.id)


@router.get("/{sponsorship_id:int}", response_model=SponsorshipOut, status_code=status.HTTP_200_OK)
def get_sponsorship(
    sponsorship_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> SponsorshipOut:
    return sponsorships_service.get_sponsorship(db, sponsorship_id)


@router.get("/{sponsorship_id:int}/timeline", response_model=SponsorshipTimelineResponse, status_code=status.HTTP_200_OK)
def get_sponsorship_timeline(
    sponsorship_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> SponsorshipTimelineResponse:
    return sponsorships_service.list_sponsorship_timeline(db, sponsorship_id)


@router.get("/{sponsorship_id:int}/notes", response_model=SponsorshipNotesListResponse, status_code=status.HTTP_200_OK)
def list_sponsorship_notes(
    sponsorship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*READ_ROLES)),
) -> SponsorshipNotesListResponse:
    return sponsorships_service.list_sponsorship_notes(db, sponsorship_id, current_user)


@router.post("/{sponsorship_id:int}/notes", response_model=SponsorshipNoteOut, status_code=status.HTTP_201_CREATED)
def create_sponsorship_note(
    sponsorship_id: int,
    payload: SponsorshipNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*MANAGE_ROLES)),
) -> SponsorshipNoteOut:
    return sponsorships_service.create_sponsorship_note(db, sponsorship_id, payload, current_user)


@router.put("/{sponsorship_id:int}", response_model=SponsorshipOut, status_code=status.HTTP_200_OK)
def update_sponsorship(
    sponsorship_id: int,
    payload: SponsorshipUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*MANAGE_ROLES)),
) -> SponsorshipOut:
    return sponsorships_service.update_sponsorship(db, sponsorship_id, payload, current_user.id)


@router.post("/{sponsorship_id:int}/status", response_model=SponsorshipOut, status_code=status.HTTP_200_OK)
def transition_sponsorship_status(
    sponsorship_id: int,
    payload: SponsorshipStatusTransitionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*MANAGE_ROLES)),
) -> SponsorshipOut:
    return sponsorships_service.transition_sponsorship_status(db, sponsorship_id, payload, current_user)


@router.post("/{sponsorship_id:int}/remind", response_model=SponsorshipOut, status_code=status.HTTP_200_OK)
def trigger_sponsorship_reminder(
    sponsorship_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*MANAGE_ROLES)),
) -> SponsorshipOut:
    return sponsorships_service.trigger_reminder(db, sponsorship_id)
