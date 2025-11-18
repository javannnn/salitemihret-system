from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status

from sqlalchemy.orm import Session

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.user import User
from app.schemas.schools import (
    AbenetEnrollmentCreate,
    AbenetEnrollmentList,
    AbenetEnrollmentOut,
    AbenetEnrollmentUpdate,
    AbenetPaymentCreate,
    AbenetReportRow,
    LessonOut,
    MezmurOut,
    SchoolsMeta,
)
from app.services import schools as school_service

router = APIRouter(prefix="/schools", tags=["schools"])

READ_ROLES = ("SchoolAdmin", "OfficeAdmin", "PublicRelations", "Admin")
WRITE_ROLES = ("SchoolAdmin", "Admin")
APPROVAL_ROLES = ("SchoolAdmin", "Admin", "Priest")


@router.get("/lessons", response_model=list[LessonOut])
def list_lessons(
    level: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> list[LessonOut]:
    return school_service.list_lessons(db, level=level)


@router.get("/mezmur", response_model=list[MezmurOut])
def list_mezmur(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> list[MezmurOut]:
    return school_service.list_mezmur(db)


@router.get("/abenet", response_model=AbenetEnrollmentList)
def list_abenet_enrollments(
    service_stage: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> AbenetEnrollmentList:
    return school_service.list_abenet_enrollments(
        db,
        page=page,
        page_size=page_size,
        service_stage=service_stage,
        status_filter=status_filter,
        q=q,
    )


@router.post("/abenet", response_model=AbenetEnrollmentOut, status_code=status.HTTP_201_CREATED)
def create_abenet_enrollment(
    payload: AbenetEnrollmentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> AbenetEnrollmentOut:
    return school_service.create_abenet_enrollment(db, payload, user)


@router.put("/abenet/{enrollment_id}", response_model=AbenetEnrollmentOut)
def update_abenet_enrollment(
    enrollment_id: int,
    payload: AbenetEnrollmentUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> AbenetEnrollmentOut:
    return school_service.update_abenet_enrollment(db, enrollment_id, payload)


@router.post("/abenet/{enrollment_id}/payments", response_model=AbenetEnrollmentOut, status_code=status.HTTP_201_CREATED)
def record_abenet_payment(
    enrollment_id: int,
    payload: AbenetPaymentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
) -> AbenetEnrollmentOut:
    return school_service.record_abenet_payment(db, enrollment_id, payload, user)


@router.get("/abenet/report", response_model=list[AbenetReportRow])
def get_abenet_report(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> list[AbenetReportRow]:
    return school_service.list_abenet_report(db)
@router.get("/meta", response_model=SchoolsMeta)
def get_schools_meta(
    _: User = Depends(require_roles(*READ_ROLES)),
) -> SchoolsMeta:
    return school_service.get_schools_meta()
