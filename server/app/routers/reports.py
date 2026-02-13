from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.deps import require_roles
from app.core.db import get_db
from app.schemas.reports import ReportActivityItem
from app.schemas.sunday_school import SundaySchoolReportRow
from app.services import reporting as reporting_service
from app.services import sunday_school as sunday_school_service

router = APIRouter(prefix="/reports", tags=["Reports"])

REPORT_ROLES = ("SundaySchoolViewer", "SundaySchoolAdmin", "OfficeAdmin", "PublicRelations", "Admin")


@router.get("/sunday-school", response_model=list[SundaySchoolReportRow])
def sunday_school_report(
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    _: str = Depends(require_roles(*REPORT_ROLES)),
) -> list[SundaySchoolReportRow]:
    return sunday_school_service.sunday_school_report(db, start=start, end=end)


@router.get("/activity", response_model=list[ReportActivityItem])
def report_activity(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    _: str = Depends(require_roles(*REPORT_ROLES)),
) -> list[ReportActivityItem]:
    return reporting_service.get_report_activity(db, limit=limit, start_date=start_date, end_date=end_date)
