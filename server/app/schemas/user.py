from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None
    is_active: bool = True


class UserOut(UserBase):
    id: int
    username: str
    roles: list[str]
    is_super_admin: bool
    last_login_at: datetime | None = None

    class Config:
        from_attributes = True
