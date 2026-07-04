from fastapi import APIRouter, Depends

from app.auth.deps import get_current_user
from app.models.user import User
from app.schemas.auth import WhoAmIResponse
from app.services.permissions import compute_effective_permissions

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/whoami", response_model=WhoAmIResponse)
def whoami(user: User = Depends(get_current_user)) -> WhoAmIResponse:
    permissions = compute_effective_permissions(user.roles, is_super_admin=user.is_super_admin)
    return WhoAmIResponse(
        id=user.id,
        user=user.email,
        username=user.username,
        full_name=user.full_name,
        is_super_admin=user.is_super_admin,
        linked_member_id=(
            user.member_link.member_id
            if user.member_link and user.member_link.status == "linked"
            else None
        ),
        must_change_password=user.must_change_password,
        terms_accepted_at=user.terms_accepted_at.isoformat() if user.terms_accepted_at else None,
        terms_version=user.terms_version,
        roles=[role.name for role in user.roles],
        permissions=permissions,
    )
