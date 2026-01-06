from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.role import Role
from app.models.user import User
from app.schemas.staff import StaffListResponse, StaffSummary

router = APIRouter(prefix="/staff", tags=["staff"])

READ_ROLES = ("Admin", "SponsorshipCommittee", "PublicRelations", "Registrar", "OfficeAdmin")


def _serialize_user(user: User) -> StaffSummary:
    return StaffSummary(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        roles=[role.name for role in user.roles],
    )


@router.get("", response_model=StaffListResponse, status_code=status.HTTP_200_OK)
def list_staff(
    *,
    search: str | None = Query(None),
    role: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> StaffListResponse:
    query = db.query(User).options(joinedload(User.roles)).filter(User.is_active.is_(True))
    if search:
        pattern = f"%{search.lower()}%"
        query = query.filter(
            or_(
                func.lower(User.email).like(pattern),
                func.lower(User.username).like(pattern),
                func.lower(func.coalesce(User.full_name, "")).like(pattern),
            )
        )
    if role:
        query = query.join(User.roles).filter(Role.name == role)

    total = query.distinct().count()
    users = query.order_by(User.full_name.asc().nullslast(), User.username.asc()).limit(limit).all()
    return StaffListResponse(items=[_serialize_user(user) for user in users], total=total)
