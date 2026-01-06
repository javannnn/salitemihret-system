from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.user import User
from app.schemas.sponsorship import (
    SponsorshipCreate,
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
        search=q,
        has_newcomer=has_newcomer,
        start_date=start_date,
        end_date=end_date,
        created_from=created_from,
        created_to=created_to,
    )


@router.get("/metrics", response_model=SponsorshipMetrics, status_code=status.HTTP_200_OK)
def get_sponsorship_metrics(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> SponsorshipMetrics:
    return sponsorships_service.get_sponsorship_metrics(db)


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
