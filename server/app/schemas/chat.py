from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel


MessageType = Literal["text", "image", "file"]


class MessageBase(BaseModel):
    content: str
    type: MessageType = "text"


class MessageCreate(MessageBase):
    recipient_id: int


class MessageRead(MessageBase):
    id: int
    sender_id: int
    recipient_id: int
    timestamp: datetime
    is_read: bool
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_mime: Optional[str] = None
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None

    class Config:
        orm_mode = True


class ChatUser(BaseModel):
    id: int
    name: str
    avatar_url: Optional[str] = None
    status: str = "offline"

    class Config:
        orm_mode = True
