from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.user import User
from app.schemas.newcomer import (
    NewcomerConvertRequest,
    NewcomerCreate,
    NewcomerListResponse,
    NewcomerOut,
    NewcomerUpdate,
)
from app.services import newcomers as newcomers_service

router = APIRouter(prefix="/newcomers", tags=["newcomers"])

READ_ROLES = ("PublicRelations", "SponsorshipCommittee", "Registrar", "Admin", "OfficeAdmin")
WRITE_ROLES = ("PublicRelations", "Registrar", "Admin")
CONVERT_ROLES = ("PublicRelations", "Registrar", "Admin", "SponsorshipCommittee")


@router.get("", response_model=NewcomerListResponse, status_code=status.HTTP_200_OK)
def list_newcomers(
    *,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    owner_id: int | None = Query(None),
    sponsor_id: int | None = Query(None),
    q: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> NewcomerListResponse:
    return newcomers_service.list_newcomers(
        db,
        page=page,
        page_size=page_size,
        status_filter=status_filter,
        owner_id=owner_id,
        sponsor_id=sponsor_id,
        search=q,
    )


@router.post("", response_model=NewcomerOut, status_code=status.HTTP_201_CREATED)
def create_newcomer(
    payload: NewcomerCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> NewcomerOut:
    return newcomers_service.create_newcomer(db, payload)


@router.get("/{newcomer_id:int}", response_model=NewcomerOut, status_code=status.HTTP_200_OK)
def get_newcomer(
    newcomer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> NewcomerOut:
    return newcomers_service.get_newcomer(db, newcomer_id)


@router.put("/{newcomer_id:int}", response_model=NewcomerOut, status_code=status.HTTP_200_OK)
def update_newcomer(
    newcomer_id: int,
    payload: NewcomerUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> NewcomerOut:
    return newcomers_service.update_newcomer(db, newcomer_id, payload)


@router.post("/{newcomer_id:int}/convert", response_model=NewcomerOut, status_code=status.HTTP_200_OK)
def convert_newcomer(
    newcomer_id: int,
    payload: NewcomerConvertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*CONVERT_ROLES)),
) -> NewcomerOut:
    return newcomers_service.convert_newcomer(db, newcomer_id, payload, current_user.id)
