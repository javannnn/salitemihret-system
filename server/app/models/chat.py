from datetime import datetime
from pathlib import Path
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import relationship
from app.core.db import Base

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    type = Column(String(20), nullable=False, default="text")
    attachment_path = Column(String(255), nullable=True)
    attachment_name = Column(String(255), nullable=True)
    attachment_mime = Column(String(100), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    sender = relationship("User", foreign_keys=[sender_id], backref="sent_messages")
    recipient = relationship("User", foreign_keys=[recipient_id], backref="received_messages")

    @property
    def attachment_url(self) -> str | None:
        if not self.attachment_path:
            return None
        try:
            relative = Path(self.attachment_path)
            # Static files are served from uploads/, so prefix with /static/
            return f"/static/{relative.as_posix()}"
        except Exception:
            return None
