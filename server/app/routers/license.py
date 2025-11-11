from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.deps import require_roles
from app.core.license import LicenseValidationError, activate_license, get_license_status
from app.models.user import User
from app.schemas.license import LicenseActivateIn, LicenseStatusOut

router = APIRouter(prefix="/license", tags=["license"])


def _serialize(status_obj) -> LicenseStatusOut:
    return LicenseStatusOut(
        state=status_obj.state,
        message=status_obj.message,
        expires_at=status_obj.expires_at,
        trial_expires_at=status_obj.trial_expires_at,
        days_remaining=status_obj.days_remaining,
        customer=status_obj.customer,
    )


@router.get("/status", response_model=LicenseStatusOut)
def read_license_status() -> LicenseStatusOut:
    return _serialize(get_license_status())


@router.post("/activate", response_model=LicenseStatusOut)
def activate_license_token(
    payload: LicenseActivateIn,
    _: User = Depends(require_roles("Admin")),
) -> LicenseStatusOut:
    try:
        status_obj = activate_license(payload.token)
    except LicenseValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _serialize(status_obj)
