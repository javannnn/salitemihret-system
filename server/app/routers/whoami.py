from fastapi import APIRouter, Depends

from app.auth.deps import get_current_user
from app.models.user import User
from app.schemas.auth import WhoAmIResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/whoami", response_model=WhoAmIResponse)
def whoami(user: User = Depends(get_current_user)) -> WhoAmIResponse:
    return WhoAmIResponse(
        user=user.email,
        full_name=user.full_name,
        roles=[role.name for role in user.roles],
    )
