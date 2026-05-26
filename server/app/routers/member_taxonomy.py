from __future__ import annotations

import re
from typing import TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.deps import require_field_permission, require_roles
from app.core.db import get_db
from app.models.member import Member
from app.models.ministry import Ministry
from app.models.tag import Tag
from app.models.user import User
from app.schemas.member import TaxonomyItemCreate, TaxonomyItemOut, TaxonomyItemUpdate

READ_ROLES = ("PublicRelations", "Registrar", "Admin", "Clerk", "OfficeAdmin", "FinanceAdmin")
MANAGEMENT_PERMISSION = ("members", "tag_ministry_management", "write")

router = APIRouter(tags=["member-taxonomy"])

ModelT = TypeVar("ModelT", Tag, Ministry)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return slug.strip("-")


def _clean_slug(name: str, slug: str | None) -> str:
    cleaned = _slugify(slug or name)
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Slug cannot be empty")
    return cleaned


def _serialize(item: Tag | Ministry, members_count: int | None = None) -> TaxonomyItemOut:
    count = len(getattr(item, "members", []) or []) if members_count is None else members_count
    return TaxonomyItemOut(id=item.id, name=item.name, slug=item.slug, members_count=count)


def _list_items(
    db: Session,
    model: type[ModelT],
    *,
    search: str | None,
    limit: int,
) -> list[TaxonomyItemOut]:
    query = (
        db.query(model, func.count(Member.id).label("members_count"))
        .outerjoin(model.members)
        .group_by(model.id)
    )
    if search:
        pattern = f"%{search.lower()}%"
        query = query.filter(func.lower(model.name).like(pattern) | func.lower(model.slug).like(pattern))
    rows = query.order_by(model.name.asc()).limit(limit).all()
    return [_serialize(item, members_count=count) for item, count in rows]


def _get_or_404(db: Session, model: type[ModelT], item_id: int, label: str) -> ModelT:
    item = db.get(model, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not found")
    return item


def _assert_unique(
    db: Session,
    model: type[ModelT],
    *,
    name: str,
    slug: str,
    exclude_id: int | None = None,
    label: str,
) -> None:
    conflict = db.query(model).filter(
        (func.lower(model.name) == name.lower()) | (func.lower(model.slug) == slug.lower())
    )
    if exclude_id is not None:
        conflict = conflict.filter(model.id != exclude_id)
    if conflict.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Another {label} already uses this name or slug")


def _create_item(db: Session, model: type[ModelT], payload: TaxonomyItemCreate, label: str) -> TaxonomyItemOut:
    name = payload.name.strip()
    slug = _clean_slug(name, payload.slug)
    _assert_unique(db, model, name=name, slug=slug, label=label)
    item = model(name=name, slug=slug)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize(item, members_count=0)


def _update_item(
    db: Session,
    model: type[ModelT],
    item_id: int,
    payload: TaxonomyItemUpdate,
    label: str,
) -> TaxonomyItemOut:
    item = _get_or_404(db, model, item_id, label)
    name = payload.name.strip() if payload.name is not None else item.name
    slug = _clean_slug(name, payload.slug if payload.slug is not None else item.slug)
    _assert_unique(db, model, name=name, slug=slug, exclude_id=item.id, label=label)
    item.name = name
    item.slug = slug
    db.commit()
    db.refresh(item)
    return _serialize(item)


def _delete_item(db: Session, model: type[ModelT], item_id: int, label: str) -> Response:
    item = _get_or_404(db, model, item_id, label)
    linked_members = len(getattr(item, "members", []) or [])
    if linked_members:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete this {label} while assigned to members. Remove those links first.",
        )
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/member-tags", response_model=list[TaxonomyItemOut], status_code=status.HTTP_200_OK)
def list_tags(
    search: str | None = Query(default=None, min_length=1),
    limit: int = Query(default=100, ge=1, le=250),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> list[TaxonomyItemOut]:
    return _list_items(db, Tag, search=search, limit=limit)


@router.post("/member-tags", response_model=TaxonomyItemOut, status_code=status.HTTP_201_CREATED)
def create_tag(
    payload: TaxonomyItemCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_field_permission(*MANAGEMENT_PERMISSION)),
) -> TaxonomyItemOut:
    return _create_item(db, Tag, payload, "tag")


@router.patch("/member-tags/{tag_id}", response_model=TaxonomyItemOut, status_code=status.HTTP_200_OK)
def update_tag(
    tag_id: int,
    payload: TaxonomyItemUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_field_permission(*MANAGEMENT_PERMISSION)),
) -> TaxonomyItemOut:
    return _update_item(db, Tag, tag_id, payload, "tag")


@router.delete("/member-tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_field_permission(*MANAGEMENT_PERMISSION)),
) -> Response:
    return _delete_item(db, Tag, tag_id, "tag")


@router.get("/member-ministries", response_model=list[TaxonomyItemOut], status_code=status.HTTP_200_OK)
def list_ministries(
    search: str | None = Query(default=None, min_length=1),
    limit: int = Query(default=100, ge=1, le=250),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> list[TaxonomyItemOut]:
    return _list_items(db, Ministry, search=search, limit=limit)


@router.post("/member-ministries", response_model=TaxonomyItemOut, status_code=status.HTTP_201_CREATED)
def create_ministry(
    payload: TaxonomyItemCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_field_permission(*MANAGEMENT_PERMISSION)),
) -> TaxonomyItemOut:
    return _create_item(db, Ministry, payload, "ministry")


@router.patch("/member-ministries/{ministry_id}", response_model=TaxonomyItemOut, status_code=status.HTTP_200_OK)
def update_ministry(
    ministry_id: int,
    payload: TaxonomyItemUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_field_permission(*MANAGEMENT_PERMISSION)),
) -> TaxonomyItemOut:
    return _update_item(db, Ministry, ministry_id, payload, "ministry")


@router.delete("/member-ministries/{ministry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ministry(
    ministry_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_field_permission(*MANAGEMENT_PERMISSION)),
) -> Response:
    return _delete_item(db, Ministry, ministry_id, "ministry")
