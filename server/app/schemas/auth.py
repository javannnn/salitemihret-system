from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: str
    password: str
    recaptcha_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class EffectivePermissionSnapshot(BaseModel):
    modules: dict[str, dict[str, bool]]
    fields: dict[str, dict[str, dict[str, bool]]] = {}
    legacy: dict[str, bool]


class WhoAmIResponse(BaseModel):
    id: int
    user: EmailStr
    username: str
    roles: list[str]
    is_super_admin: bool = False
    full_name: str | None = None
    must_change_password: bool = False
    permissions: EffectivePermissionSnapshot
