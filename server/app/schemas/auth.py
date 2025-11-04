from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class WhoAmIResponse(BaseModel):
    user: EmailStr
    roles: list[str]
    full_name: str | None = None
