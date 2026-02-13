from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.deps import require_roles
from app.config import MEMBER_ATTACHMENT_UPLOAD_DIR, UPLOAD_DIR
from app.core.db import get_db
from app.models.member import Member
from app.models.user import User
from app.schemas.member import AvatarUploadResponse, ContributionExceptionAttachmentUploadResponse
from app.services.audit import record_member_changes, snapshot_member

router = APIRouter(prefix="/members", tags=["members"])

WRITE_ROLES = ("Registrar", "Admin")
EXCEPTION_ATTACHMENT_ROLES = ("Admin", "FinanceAdmin", "Registrar", "PublicRelations")
MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024

ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
}
ALLOWED_EXCEPTION_ATTACHMENT_MIME_TYPES = {"application/pdf"}


def _relative_avatar_path(filename: str) -> str:
    relative_root = UPLOAD_DIR.relative_to(UPLOAD_DIR.parent)
    return (relative_root / filename).as_posix()


def _relative_exception_attachment_path(filename: str) -> str:
    relative_root = MEMBER_ATTACHMENT_UPLOAD_DIR.relative_to(MEMBER_ATTACHMENT_UPLOAD_DIR.parent)
    return (relative_root / filename).as_posix()


def _resolve_upload_path(relative_path: str | None) -> Path | None:
    if not relative_path:
        return None
    uploads_root = UPLOAD_DIR.parent.resolve()
    candidate = (uploads_root / relative_path).resolve()
    try:
        candidate.relative_to(uploads_root)
    except ValueError:
        return None
    return candidate


def _delete_file_if_exists(relative_path: str | None) -> None:
    absolute_path = _resolve_upload_path(relative_path)
    if absolute_path is None:
        return
    try:
        absolute_path.unlink(missing_ok=True)
    except OSError:
        return


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


@router.post(
    "/{member_id}/contribution-exception-attachment",
    response_model=ContributionExceptionAttachmentUploadResponse,
    status_code=status.HTTP_200_OK,
)
def upload_contribution_exception_attachment(
    member_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*EXCEPTION_ATTACHMENT_ROLES)),
) -> ContributionExceptionAttachmentUploadResponse:
    member = (
        db.query(Member)
        .filter(Member.id == member_id, Member.deleted_at.is_(None))
        .first()
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if member.contribution_exception_reason != "LowIncome":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Select Low income exception before uploading supporting documents.",
        )

    content_type = (file.content_type or "").lower()
    original_name = Path(file.filename or "low-income-proof.pdf").name
    if content_type not in ALLOWED_EXCEPTION_ATTACHMENT_MIME_TYPES and not original_name.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only PDF uploads are allowed.",
        )

    try:
        data = file.file.read(MAX_ATTACHMENT_SIZE_BYTES + 1)
    finally:
        file.file.close()

    if len(data) > MAX_ATTACHMENT_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is too large. Maximum allowed size is 5MB.",
        )

    filename = f"{member_id}_{datetime.utcnow():%Y%m%d%H%M%S%f}_{uuid4().hex}.pdf"
    target = MEMBER_ATTACHMENT_UPLOAD_DIR / filename
    target.write_bytes(data)

    old_path = member.contribution_exception_attachment_path
    old_snapshot = snapshot_member(member)
    member.contribution_exception_attachment_path = _relative_exception_attachment_path(filename)
    member.updated_by_id = current_user.id

    db.flush()
    record_member_changes(db, member, old_snapshot, current_user.id)
    db.commit()
    db.refresh(member)

    if old_path and old_path != member.contribution_exception_attachment_path:
        _delete_file_if_exists(old_path)

    return ContributionExceptionAttachmentUploadResponse(
        attachment_url=f"/static/{member.contribution_exception_attachment_path}",
        attachment_name=original_name,
    )


@router.delete("/{member_id}/contribution-exception-attachment", status_code=status.HTTP_204_NO_CONTENT)
def delete_contribution_exception_attachment(
    member_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*EXCEPTION_ATTACHMENT_ROLES)),
) -> Response:
    member = (
        db.query(Member)
        .filter(Member.id == member_id, Member.deleted_at.is_(None))
        .first()
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if not member.contribution_exception_attachment_path:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    old_snapshot = snapshot_member(member)
    old_path = member.contribution_exception_attachment_path
    member.contribution_exception_attachment_path = None
    member.updated_by_id = current_user.id

    db.flush()
    record_member_changes(db, member, old_snapshot, current_user.id)
    db.commit()

    _delete_file_if_exists(old_path)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
