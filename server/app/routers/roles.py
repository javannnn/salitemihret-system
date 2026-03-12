from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.deps import require_super_admin
from app.core.db import get_db
from app.models.role import Role
from app.models.user import User, user_roles
from app.schemas.role import (
    RoleCreateRequest,
    RoleListResponse,
    RolePermissionCatalogResponse,
    RoleSummary,
    RoleUpdateRequest,
)
from app.services.permissions import (
    is_system_role_name,
    normalize_field_permissions,
    normalize_module_permissions,
    permission_catalog_payload,
    resolve_role_field_permissions,
    resolve_role_module_permissions,
)

router = APIRouter(prefix="/roles", tags=["roles"])

ROLE_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9 _-]{1,63}$")


def _normalize_role_name(value: str) -> str:
    normalized = re.sub(r"\s+", " ", value).strip()
    if not ROLE_NAME_PATTERN.fullmatch(normalized):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role name must start with a letter and can include letters, numbers, spaces, underscores, or hyphens.",
        )
    return normalized


def _serialize_role(role: Role) -> RoleSummary:
    module_permissions = resolve_role_module_permissions(role)
    field_permissions = resolve_role_field_permissions(role)
    is_system = bool(role.is_system) or is_system_role_name(role.name)
    return RoleSummary(
        id=role.id,
        name=role.name,
        description=role.description,
        is_system=is_system,
        module_permissions=module_permissions,
        field_permissions=field_permissions,
        created_at=getattr(role, "created_at", None),
        updated_at=getattr(role, "updated_at", None),
    )


def _load_role(db: Session, role_id: int) -> Role:
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    return role


@router.get("/catalog", response_model=RolePermissionCatalogResponse)
def get_permission_catalog(_: User = Depends(require_super_admin)) -> RolePermissionCatalogResponse:
    modules = permission_catalog_payload()
    return RolePermissionCatalogResponse(modules=modules)


@router.get("", response_model=RoleListResponse)
def list_roles(
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> RoleListResponse:
    roles = db.query(Role).order_by(Role.name.asc()).all()
    items = sorted(
        (_serialize_role(role) for role in roles),
        key=lambda item: (not item.is_system, item.name.lower()),
    )
    return RoleListResponse(items=items, total=len(items))


@router.post("", response_model=RoleSummary, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreateRequest,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> RoleSummary:
    role_name = _normalize_role_name(payload.name)
    existing = db.query(Role).filter(func.lower(Role.name) == role_name.lower()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role name already exists")

    role = Role(
        name=role_name,
        description=payload.description.strip() if payload.description else None,
        is_system=is_system_role_name(role_name),
        module_permissions=normalize_module_permissions(payload.module_permissions, include_all_modules=True),
        field_permissions=normalize_field_permissions(payload.field_permissions),
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return _serialize_role(role)


@router.patch("/{role_id}", response_model=RoleSummary)
def update_role(
    role_id: int,
    payload: RoleUpdateRequest,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> RoleSummary:
    role = _load_role(db, role_id)

    if payload.name is not None:
        if (role.is_system or is_system_role_name(role.name)) and payload.name.strip() != role.name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System role names cannot be changed")
        next_name = _normalize_role_name(payload.name)
        duplicate = (
            db.query(Role)
            .filter(func.lower(Role.name) == next_name.lower(), Role.id != role.id)
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role name already exists")
        role.name = next_name

    if payload.description is not None:
        role.description = payload.description.strip() if payload.description else None

    if payload.module_permissions is not None:
        role.module_permissions = normalize_module_permissions(payload.module_permissions, include_all_modules=True)

    if payload.field_permissions is not None:
        role.field_permissions = normalize_field_permissions(payload.field_permissions)

    db.commit()
    db.refresh(role)
    return _serialize_role(role)


@router.delete("/{role_id}", status_code=status.HTTP_200_OK)
def delete_role(
    role_id: int,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    role = _load_role(db, role_id)
    if role.is_system or is_system_role_name(role.name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System roles cannot be deleted")

    assignment_exists = (
        db.query(user_roles.c.user_id)
        .filter(user_roles.c.role_id == role.id)
        .first()
    )
    if assignment_exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Role is assigned to users. Unassign users first.",
        )

    db.delete(role)
    db.commit()
    return {"status": "deleted"}
