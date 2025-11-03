from __future__ import annotations

import shutil
from datetime import datetime
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.deps import require_roles
from app.config import UPLOAD_DIR
from app.core.db import get_db
from app.models.member import Member
from app.models.user import User
from app.schemas.member import AvatarUploadResponse
from app.services.audit import record_member_changes, snapshot_member

router = APIRouter(prefix="/members", tags=["members"])

WRITE_ROLES = ("Registrar", "Admin")

ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
}


def _relative_avatar_path(filename: str) -> str:
    relative_root = UPLOAD_DIR.relative_to(UPLOAD_DIR.parent)
    return (relative_root / filename).as_posix()


@router.post("/{member_id}/avatar", response_model=AvatarUploadResponse, status_code=status.HTTP_200_OK)
def upload_member_avatar(
    member_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*WRITE_ROLES)),
) -> AvatarUploadResponse:
    content_type = file.content_type or ""
    extension = ALLOWED_CONTENT_TYPES.get(content_type.lower())
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid avatar file type. Allowed types: PNG, JPEG, WEBP.",
        )

    member = (
        db.query(Member)
        .filter(Member.id == member_id, Member.deleted_at.is_(None))
        .first()
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    old_snapshot = snapshot_member(member)
    filename = f"{member_id}_{datetime.utcnow():%Y%m%d%H%M%S%f}.{extension}"
    absolute_path = UPLOAD_DIR / filename

    try:
        with absolute_path.open("wb") as destination:
            shutil.copyfileobj(file.file, destination)
    finally:
        file.file.close()

    member.avatar_path = _relative_avatar_path(filename)
    member.updated_by_id = current_user.id

    db.flush()
    record_member_changes(db, member, old_snapshot, current_user.id)
    db.commit()
    db.refresh(member)

    return AvatarUploadResponse(avatar_url=f"/static/{member.avatar_path}")
