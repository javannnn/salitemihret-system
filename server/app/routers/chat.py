from pathlib import Path
from typing import List
from uuid import uuid4
import shutil
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.core.db import get_db
from app.auth.deps import get_current_active_user
from app.models.user import User
from app.models.chat import Message
from app.schemas.chat import MessageCreate, MessageRead, ChatUser, MessageType
from app.config import CHAT_UPLOAD_DIR

router = APIRouter(prefix="/chat", tags=["chat"])

ALLOWED_ATTACHMENT_TYPES: dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
}


def _save_chat_attachment(upload: UploadFile) -> tuple[str, str, str, MessageType]:
    content_type = (upload.content_type or "").lower()
    if content_type not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type for chat attachments.",
        )

    safe_name = Path(upload.filename or "file").name
    extension = ALLOWED_ATTACHMENT_TYPES[content_type]
    filename = f"{uuid4().hex}.{extension}"
    target = CHAT_UPLOAD_DIR / filename

    try:
        with target.open("wb") as destination:
            shutil.copyfileobj(upload.file, destination)
    finally:
        upload.file.close()

    relative_path = target.relative_to(CHAT_UPLOAD_DIR.parent).as_posix()
    msg_type: MessageType = "image" if content_type.startswith("image/") else "file"
    return relative_path, safe_name, content_type, msg_type


@router.post("/messages", response_model=MessageRead)
def send_message(
    message: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if message.type != "text":
        raise HTTPException(status_code=400, detail="Only text messages are supported on this endpoint.")

    recipient = db.query(User).filter(User.id == message.recipient_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    db_message = Message(
        sender_id=current_user.id,
        recipient_id=message.recipient_id,
        content=message.content,
        type="text",
        is_deleted=False,
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message


@router.post("/messages/upload", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
def upload_message_attachment(
    recipient_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    recipient = db.query(User).filter(User.id == recipient_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    relative_path, attachment_name, attachment_mime, msg_type = _save_chat_attachment(file)

    db_message = Message(
        sender_id=current_user.id,
        recipient_id=recipient_id,
        content=attachment_name,
        type=msg_type,
        attachment_path=relative_path,
        attachment_name=attachment_name,
        attachment_mime=attachment_mime,
        is_deleted=False,
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message


@router.get("/messages", response_model=List[MessageRead])
def get_messages(
    other_user_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    query = db.query(Message)

    if other_user_id:
        # Get conversation with specific user
        query = query.filter(
            or_(
                and_(Message.sender_id == current_user.id, Message.recipient_id == other_user_id),
                and_(Message.sender_id == other_user_id, Message.recipient_id == current_user.id),
            )
        )
    else:
        # Get all messages involving current user
        query = query.filter(
            or_(
                Message.sender_id == current_user.id,
                Message.recipient_id == current_user.id,
            )
        )

    return query.order_by(Message.timestamp.asc()).all()


@router.put("/messages/{message_id}/read", response_model=MessageRead)
def mark_message_read(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.recipient_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    message.is_read = True
    db.commit()
    db.refresh(message)
    return message


@router.delete("/messages/{message_id}", response_model=MessageRead)
def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this message")

    message.is_deleted = True
    message.deleted_at = datetime.utcnow()
    message.attachment_path = None
    message.attachment_name = None
    message.attachment_mime = None
    message.content = "This message was deleted"

    db.commit()
    db.refresh(message)
    return message


@router.post("/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
def heartbeat(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    current_user.last_seen = datetime.utcnow()
    db.commit()


@router.get("/users", response_model=List[ChatUser])
def get_chat_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    users = db.query(User).filter(User.is_active == True).all()
    
    # 5 minutes cutoff for online status
    cutoff = datetime.utcnow().timestamp() - 300
    
    result = []
    for user in users:
        if user.id == current_user.id:
            continue
            
        is_online = False
        if user.last_seen:
            is_online = user.last_seen.timestamp() > cutoff
            
        result.append(
            ChatUser(
                id=user.id,
                name=user.full_name or user.username,
                avatar_url=f"https://ui-avatars.com/api/?name={user.full_name or user.username}&background=random",
                status="online" if is_online else "offline"
            )
        )
    return result
