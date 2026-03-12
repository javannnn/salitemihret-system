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
        must_change_password=user.must_change_password,
        roles=[role.name for role in user.roles],
        permissions=permissions,
    )
