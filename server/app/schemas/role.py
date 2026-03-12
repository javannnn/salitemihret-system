from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class RolePermissionFlags(BaseModel):
    read: bool = False
    write: bool = False


class RoleFieldPermissionFlags(BaseModel):
    read: bool = False
    write: bool = False


class RoleFieldCatalogEntry(BaseModel):
    key: str
    label: str
    description: str


class RoleModuleCatalogEntry(BaseModel):
    key: str
    label: str
    description: str
    fields: list[RoleFieldCatalogEntry] = Field(default_factory=list)


class RolePermissionCatalogResponse(BaseModel):
    modules: list[RoleModuleCatalogEntry] = Field(default_factory=list)


class RoleSummary(BaseModel):
    id: int
    name: str
    description: str | None = None
    is_system: bool
    module_permissions: dict[str, RolePermissionFlags] = Field(default_factory=dict)
    field_permissions: dict[str, dict[str, RoleFieldPermissionFlags]] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class RoleListResponse(BaseModel):
    items: list[RoleSummary]
    total: int


class RoleCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=64)
    description: str | None = Field(default=None, max_length=255)
    module_permissions: dict[str, RolePermissionFlags] = Field(default_factory=dict)
    field_permissions: dict[str, dict[str, RoleFieldPermissionFlags]] = Field(default_factory=dict)


class RoleUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=64)
    description: str | None = Field(default=None, max_length=255)
    module_permissions: dict[str, RolePermissionFlags] | None = None
    field_permissions: dict[str, dict[str, RoleFieldPermissionFlags]] | None = None
