from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import asc, desc, func, or_
from sqlalchemy.orm import Query, Session

from app.models.member import Member
from app.models.ministry import Ministry
from app.models.tag import Tag
from app.schemas.member import ALLOWED_MEMBER_GENDERS, ALLOWED_MEMBER_STATUSES

SORTABLE_FIELDS = {
    "first_name": Member.first_name,
    "last_name": Member.last_name,
    "created_at": Member.created_at,
    "updated_at": Member.updated_at,
}


def build_members_query(
    db: Session,
    *,
    status_filter: str | None,
    q: str | None,
    tag: str | None,
    ministry: str | None,
    gender: str | None,
    district: str | None,
) -> Query:
    query: Query = db.query(Member)

    if status_filter == "Archived":
        query = query.filter(Member.deleted_at.isnot(None))
    else:
        query = query.filter(Member.deleted_at.is_(None))
        if status_filter:
            if status_filter not in ALLOWED_MEMBER_STATUSES:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status filter")
            query = query.filter(Member.status == status_filter)

    if q:
        pattern = f"%{q.lower()}%"
        query = query.filter(
            or_(
                func.lower(Member.first_name).like(pattern),
                func.lower(Member.middle_name).like(pattern),
                func.lower(Member.last_name).like(pattern),
                func.lower(Member.username).like(pattern),
                func.lower(Member.email).like(pattern),
                func.lower(Member.phone).like(pattern),
                func.lower(Member.address).like(pattern),
                func.lower(Member.district).like(pattern),
            )
        )

    distinct_needed = False

    if tag:
        tag_query = query.join(Member.tags)
        if tag.isdigit():
            tag_query = tag_query.filter(Tag.id == int(tag))
        else:
            tag_query = tag_query.filter(func.lower(Tag.slug) == tag.lower())
        query = tag_query
        distinct_needed = True

    if ministry:
        ministry_query = query.join(Member.ministries)
        if ministry.isdigit():
            ministry_query = ministry_query.filter(Ministry.id == int(ministry))
        else:
            ministry_query = ministry_query.filter(func.lower(Ministry.slug) == ministry.lower())
        query = ministry_query
        distinct_needed = True

    if gender:
        if gender not in ALLOWED_MEMBER_GENDERS:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid gender filter")
        query = query.filter(Member.gender == gender)

    if district:
        query = query.filter(func.lower(Member.district) == district.lower())

    if distinct_needed:
        query = query.distinct()

    return query


def apply_member_sort(query: Query, sort_param: str | None) -> Query:
    if not sort_param:
        return query.order_by(asc(Member.last_name), asc(Member.first_name))

    order_columns = []
    for raw_key in sort_param.split(","):
        key = raw_key.strip()
        if not key:
            continue
        direction = asc
        if key.startswith("-"):
            direction = desc
            key = key[1:]
        column = SORTABLE_FIELDS.get(key)
        if column is not None:
            order_columns.append(direction(column))

    if not order_columns:
        order_columns = [asc(Member.last_name), asc(Member.first_name)]
    return query.order_by(*order_columns)
