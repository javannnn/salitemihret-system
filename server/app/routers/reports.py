from __future__ import annotations

from datetime import date

from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.core.db import get_db
from app.models.user import User
from app.schemas.reports import NewcomerReportResponse, ReportActivityItem
from app.schemas.sunday_school import SundaySchoolReportRow
from app.services import reporting as reporting_service
from app.services import sunday_school as sunday_school_service
from app.services.permissions import has_field_permission, has_module_permission

router = APIRouter(prefix="/reports", tags=["Reports"])


def require_report_access(report_field: str, *, source_module: str | None = None) -> Callable[..., User]:
    def checker(user: User = Depends(get_current_user)) -> User:
        if not has_field_permission(user, "reports", report_field, "read"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Report access denied")
        if source_module and not has_module_permission(user, source_module, "read"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Report source access denied")
        return user

    return checker


@router.get("/sunday-school", response_model=list[SundaySchoolReportRow])
def sunday_school_report(
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    _: User = Depends(require_report_access("schools", source_module="schools")),
) -> list[SundaySchoolReportRow]:
    return sunday_school_service.sunday_school_report(db, start=start, end=end)


@router.get("/activity", response_model=list[ReportActivityItem])
def report_activity(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_report_access("overview")),
) -> list[ReportActivityItem]:
    return reporting_service.get_report_activity(db, limit=limit, start_date=start_date, end_date=end_date)


@router.get("/newcomers", response_model=NewcomerReportResponse)
def newcomer_report(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_report_access("newcomers", source_module="newcomers")),
) -> NewcomerReportResponse:
    return reporting_service.get_newcomer_report(db, start_date=start_date, end_date=end_date)
