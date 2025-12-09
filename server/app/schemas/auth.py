from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    recaptcha_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class WhoAmIResponse(BaseModel):
    id: int
    user: EmailStr
    username: str
    roles: list[str]
    is_super_admin: bool = False
    full_name: str | None = None
