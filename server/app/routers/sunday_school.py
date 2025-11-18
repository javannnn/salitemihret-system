from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.user import User
from app.schemas.sunday_school import (
    ParticipantList,
    ParticipantCreate,
    ParticipantOut,
    ParticipantUpdate,
    ParticipantDetail,
    ContributionCreate,
    SundaySchoolStats,
    ContentCreate,
    ContentUpdate,
    ContentList,
    ContentOut,
    ContentApprovalRequest,
    ContentRejectionRequest,
    PublicContentOut,
    SundaySchoolMeta,
)
from app.services import sunday_school as sunday_school_service

router = APIRouter(prefix="/sunday-school", tags=["Sunday School"])
public_router = APIRouter(prefix="/public/sunday-school", tags=["Public Sunday School"])

VIEW_ROLES = ("SundaySchoolViewer", "SundaySchoolAdmin", "OfficeAdmin", "Admin")
MANAGE_ROLES = ("SundaySchoolAdmin", "Admin")
APPROVE_ROLES = ("SundaySchoolApprover", "Priest", "Admin")


@router.get("/meta", response_model=SundaySchoolMeta)
def get_meta(
    _: User = Depends(require_roles(*VIEW_ROLES)),
) -> SundaySchoolMeta:
    return sunday_school_service.get_meta()


@router.get("/participants", response_model=ParticipantList)
def list_participants(
    category: str | None = Query(default=None),
    pays_contribution: bool | None = Query(default=None),
    membership_from: date | None = Query(default=None),
    membership_to: date | None = Query(default=None),
    last_payment_from: date | None = Query(default=None),
    last_payment_to: date | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*VIEW_ROLES)),
) -> ParticipantList:
    return sunday_school_service.list_participants(
        db,
        page=page,
        page_size=page_size,
        category=category,
        pays_contribution=pays_contribution,
        membership_from=membership_from,
        membership_to=membership_to,
        last_payment_from=last_payment_from,
        last_payment_to=last_payment_to,
        search=search,
    )


@router.get("/participants/stats", response_model=SundaySchoolStats)
def get_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*VIEW_ROLES)),
) -> SundaySchoolStats:
    return sunday_school_service.participants_stats(db)


@router.post("/participants", response_model=ParticipantOut, status_code=status.HTTP_201_CREATED)
def create_participant(
    payload: ParticipantCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*MANAGE_ROLES)),
) -> ParticipantOut:
    return sunday_school_service.create_participant(db, payload, user)


@router.get("/participants/{participant_id}", response_model=ParticipantDetail)
def get_participant(
    participant_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*VIEW_ROLES)),
) -> ParticipantDetail:
    return sunday_school_service.get_participant(db, participant_id)


@router.put("/participants/{participant_id}", response_model=ParticipantOut)
def update_participant(
    participant_id: int,
    payload: ParticipantUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*MANAGE_ROLES)),
) -> ParticipantOut:
    return sunday_school_service.update_participant(db, participant_id, payload, user)


@router.delete("/participants/{participant_id}", response_model=ParticipantOut)
def deactivate_participant(
    participant_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*MANAGE_ROLES)),
) -> ParticipantOut:
    return sunday_school_service.deactivate_participant(db, participant_id, user)


@router.post("/participants/{participant_id}/payments", response_model=ParticipantOut, status_code=status.HTTP_201_CREATED)
def record_contribution(
    participant_id: int,
    payload: ContributionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*MANAGE_ROLES)),
) -> ParticipantOut:
    return sunday_school_service.record_contribution(db, participant_id, payload, user)


@router.get("/content", response_model=ContentList)
def list_content(
    content_type: str | None = Query(default=None, alias="type"),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*VIEW_ROLES)),
) -> ContentList:
    return sunday_school_service.list_content(db, content_type=content_type, status_filter=status_filter, search=search)


@router.post("/content", response_model=ContentOut, status_code=status.HTTP_201_CREATED)
def create_content(
    payload: ContentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*MANAGE_ROLES)),
) -> ContentOut:
    return sunday_school_service.create_content(db, payload, user)


@router.put("/content/{content_id}", response_model=ContentOut)
def update_content(
    content_id: int,
    payload: ContentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*MANAGE_ROLES)),
) -> ContentOut:
    return sunday_school_service.update_content(db, content_id, payload, user)


@router.post("/content/{content_id}/submit", response_model=ContentOut)
def submit_content(
    content_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*MANAGE_ROLES)),
) -> ContentOut:
    return sunday_school_service.submit_content(db, content_id, user)


@router.post("/content/{content_id}/approve", response_model=ContentOut)
def approve_content(
    content_id: int,
    request: ContentApprovalRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*APPROVE_ROLES)),
) -> ContentOut:
    return sunday_school_service.approve_content(db, content_id, user, request)


@router.post("/content/{content_id}/reject", response_model=ContentOut)
def reject_content(
    content_id: int,
    request: ContentRejectionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*APPROVE_ROLES)),
) -> ContentOut:
    return sunday_school_service.reject_content(db, content_id, user, request)


@public_router.get("/mezmur", response_model=list[PublicContentOut])
def public_mezmur(db: Session = Depends(get_db)) -> list[PublicContentOut]:
    return sunday_school_service.list_public_content(db, content_type="Mezmur")


@public_router.get("/lessons", response_model=list[PublicContentOut])
def public_lessons(db: Session = Depends(get_db)) -> list[PublicContentOut]:
    return sunday_school_service.list_public_content(db, content_type="Lesson")


@public_router.get("/art", response_model=list[PublicContentOut])
def public_art(db: Session = Depends(get_db)) -> list[PublicContentOut]:
    return sunday_school_service.list_public_content(db, content_type="Art")
