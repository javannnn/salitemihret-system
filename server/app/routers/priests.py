from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.priest import Priest
from app.models.user import User
from app.schemas.member import PriestCreate, PriestOut

READ_ROLES = ("PublicRelations", "Registrar", "Admin", "Clerk", "OfficeAdmin", "FinanceAdmin")
WRITE_ROLES = ("Admin", "PublicRelations")

router = APIRouter(prefix="/priests", tags=["priests"])


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
