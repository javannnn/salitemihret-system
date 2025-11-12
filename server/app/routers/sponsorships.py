from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.user import User
from app.schemas.sponsorship import (
    SponsorshipCreate,
    SponsorshipListResponse,
    SponsorshipOut,
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
    frequency: str | None = Query(None),
    q: str | None = Query(None),
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
        frequency=frequency,
        search=q,
    )


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


@router.put("/{sponsorship_id:int}", response_model=SponsorshipOut, status_code=status.HTTP_200_OK)
def update_sponsorship(
    sponsorship_id: int,
    payload: SponsorshipUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*MANAGE_ROLES)),
) -> SponsorshipOut:
    return sponsorships_service.update_sponsorship(db, sponsorship_id, payload, current_user.id)


@router.post("/{sponsorship_id:int}/remind", response_model=SponsorshipOut, status_code=status.HTTP_200_OK)
def trigger_sponsorship_reminder(
    sponsorship_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*MANAGE_ROLES)),
) -> SponsorshipOut:
    return sponsorships_service.trigger_reminder(db, sponsorship_id)
