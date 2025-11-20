from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.priest import Priest
from app.models.user import User
from app.schemas.member import PriestCreate, PriestOut, PriestUpdate

READ_ROLES = ("PublicRelations", "Registrar", "Admin", "Clerk", "OfficeAdmin", "FinanceAdmin")
WRITE_ROLES = ("Admin", "PublicRelations")

router = APIRouter(prefix="/priests", tags=["priests"])


def _get_priest_or_404(db: Session, priest_id: int) -> Priest:
    priest = db.query(Priest).filter(Priest.id == priest_id).first()
    if not priest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Priest not found")
    return priest


@router.get("", response_model=list[PriestOut], status_code=status.HTTP_200_OK)
def list_priests(
    *,
    search: str | None = Query(default=None, min_length=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> list[PriestOut]:
    query = db.query(Priest)
    if search:
        pattern = f"%{search.lower()}%"
        query = query.filter(func.lower(Priest.full_name).like(pattern))
    items = query.order_by(Priest.full_name.asc()).limit(limit).all()
    return [PriestOut.from_orm(item) for item in items]


@router.post("", response_model=PriestOut, status_code=status.HTTP_201_CREATED)
def create_priest(
    payload: PriestCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> PriestOut:
    existing = (
        db.query(Priest)
        .filter(func.lower(Priest.full_name) == payload.full_name.lower())
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Priest already exists")

    priest = Priest(
        full_name=payload.full_name.strip(),
        phone=payload.phone.strip() if payload.phone else None,
        email=payload.email,
        status=payload.status or "Active",
    )
    db.add(priest)
    db.commit()
    db.refresh(priest)
    return PriestOut.from_orm(priest)


@router.get("/{priest_id}", response_model=PriestOut, status_code=status.HTTP_200_OK)
def get_priest(
    priest_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> PriestOut:
    priest = _get_priest_or_404(db, priest_id)
    return PriestOut.from_orm(priest)


@router.patch("/{priest_id}", response_model=PriestOut, status_code=status.HTTP_200_OK)
def update_priest(
    priest_id: int,
    payload: PriestUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> PriestOut:
    priest = _get_priest_or_404(db, priest_id)

    if payload.full_name:
        cleaned = payload.full_name.strip()
        conflict = (
            db.query(Priest)
            .filter(func.lower(Priest.full_name) == cleaned.lower(), Priest.id != priest.id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Another priest already uses this name")
        priest.full_name = cleaned

    if payload.phone is not None:
        priest.phone = payload.phone.strip() if payload.phone else None
    if payload.email is not None:
        priest.email = payload.email
    if payload.status is not None:
        priest.status = payload.status

    db.commit()
    db.refresh(priest)
    return PriestOut.from_orm(priest)


@router.post("/{priest_id}/archive", response_model=PriestOut, status_code=status.HTTP_200_OK)
def archive_priest(
    priest_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> PriestOut:
    priest = _get_priest_or_404(db, priest_id)
    priest.status = "Inactive"
    db.commit()
    db.refresh(priest)
    return PriestOut.from_orm(priest)


@router.post("/{priest_id}/restore", response_model=PriestOut, status_code=status.HTTP_200_OK)
def restore_priest(
    priest_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> PriestOut:
    priest = _get_priest_or_404(db, priest_id)
    priest.status = "Active"
    db.commit()
    db.refresh(priest)
    return PriestOut.from_orm(priest)
