from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.user import User
from app.schemas.newcomer import (
    NewcomerAddressHistoryListResponse,
    NewcomerConvertRequest,
    NewcomerCreate,
    NewcomerInactivateRequest,
    NewcomerInteractionCreate,
    NewcomerInteractionListResponse,
    NewcomerInteractionOut,
    NewcomerListResponse,
    NewcomerMetrics,
    NewcomerOut,
    NewcomerReactivateRequest,
    NewcomerStatusTransitionRequest,
    NewcomerTimelineResponse,
    NewcomerUpdate,
)
from app.services import newcomers as newcomers_service

router = APIRouter(prefix="/newcomers", tags=["newcomers"])

READ_ROLES = ("PublicRelations", "SponsorshipCommittee", "Registrar", "Admin", "OfficeAdmin")
WRITE_ROLES = ("PublicRelations", "Registrar", "Admin")
CONVERT_ROLES = ("PublicRelations", "Registrar", "Admin", "SponsorshipCommittee")
ADMIN_ROLES = ("Admin",)


def _is_admin(user: User) -> bool:
    if user.is_super_admin:
        return True
    return any(role.name == "Admin" for role in user.roles)


@router.get("", response_model=NewcomerListResponse, status_code=status.HTTP_200_OK)
def list_newcomers(
    *,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    assigned_owner_id: int | None = Query(None),
    sponsor_id: int | None = Query(None),
    county: str | None = Query(None),
    interpreter_required: bool | None = Query(None),
    inactive: bool | None = Query(None),
    q: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> NewcomerListResponse:
    return newcomers_service.list_newcomers(
        db,
        page=page,
        page_size=page_size,
        status_filter=status_filter,
        assigned_owner_id=assigned_owner_id,
        sponsor_id=sponsor_id,
        county=county,
        interpreter_required=interpreter_required,
        is_inactive=inactive,
        search=q,
    )


@router.get("/metrics", response_model=NewcomerMetrics, status_code=status.HTTP_200_OK)
def get_newcomer_metrics(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> NewcomerMetrics:
    return newcomers_service.get_newcomer_metrics(db)


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
    current_user: User = Depends(require_roles(*WRITE_ROLES)),
) -> NewcomerOut:
    return newcomers_service.update_newcomer(db, newcomer_id, payload, current_user.id)


@router.post("/{newcomer_id:int}/status", response_model=NewcomerOut, status_code=status.HTTP_200_OK)
def transition_newcomer_status(
    newcomer_id: int,
    payload: NewcomerStatusTransitionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*WRITE_ROLES)),
) -> NewcomerOut:
    return newcomers_service.transition_newcomer_status(db, newcomer_id, payload, current_user.id)


@router.post("/{newcomer_id:int}/inactivate", response_model=NewcomerOut, status_code=status.HTTP_200_OK)
def inactivate_newcomer(
    newcomer_id: int,
    payload: NewcomerInactivateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ADMIN_ROLES)),
) -> NewcomerOut:
    return newcomers_service.inactivate_newcomer(db, newcomer_id, payload, current_user.id)


@router.post("/{newcomer_id:int}/reactivate", response_model=NewcomerOut, status_code=status.HTTP_200_OK)
def reactivate_newcomer(
    newcomer_id: int,
    payload: NewcomerReactivateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ADMIN_ROLES)),
) -> NewcomerOut:
    return newcomers_service.reactivate_newcomer(db, newcomer_id, payload, current_user.id)


@router.get("/{newcomer_id:int}/interactions", response_model=NewcomerInteractionListResponse, status_code=status.HTTP_200_OK)
def list_newcomer_interactions(
    newcomer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*READ_ROLES)),
) -> NewcomerInteractionListResponse:
    return newcomers_service.list_interactions(
        db,
        newcomer_id,
        actor_id=current_user.id,
        include_restricted=_is_admin(current_user),
    )


@router.post("/{newcomer_id:int}/interactions", response_model=NewcomerInteractionOut, status_code=status.HTTP_201_CREATED)
def create_newcomer_interaction(
    newcomer_id: int,
    payload: NewcomerInteractionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*WRITE_ROLES)),
) -> NewcomerInteractionOut:
    return newcomers_service.create_interaction(db, newcomer_id, payload, current_user.id)


@router.get("/{newcomer_id:int}/address-history", response_model=NewcomerAddressHistoryListResponse, status_code=status.HTTP_200_OK)
def list_newcomer_address_history(
    newcomer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> NewcomerAddressHistoryListResponse:
    return newcomers_service.list_address_history(db, newcomer_id)


@router.get("/{newcomer_id:int}/timeline", response_model=NewcomerTimelineResponse, status_code=status.HTTP_200_OK)
def list_newcomer_timeline(
    newcomer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*READ_ROLES)),
) -> NewcomerTimelineResponse:
    return newcomers_service.list_timeline(db, newcomer_id, current_user)


@router.post("/{newcomer_id:int}/convert", response_model=NewcomerOut, status_code=status.HTTP_200_OK)
def convert_newcomer(
    newcomer_id: int,
    payload: NewcomerConvertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*CONVERT_ROLES)),
) -> NewcomerOut:
    return newcomers_service.convert_newcomer(db, newcomer_id, payload, current_user.id)
