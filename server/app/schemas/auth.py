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
    linked_member_id: int | None = None
    full_name: str | None = None
    must_change_password: bool = False
    terms_accepted_at: str | None = None
    terms_version: str | None = None
    permissions: EffectivePermissionSnapshot


class TermsAcceptanceResponse(BaseModel):
    accepted: bool
    terms_accepted_at: str
    terms_version: str
