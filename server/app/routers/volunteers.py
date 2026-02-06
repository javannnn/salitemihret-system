from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.user import User
from app.models.volunteer_group import VolunteerGroup
from app.models.volunteer_worker import VolunteerWorker
from app.schemas.volunteer import (
    VolunteerGroupCreate,
    VolunteerGroupOut,
    VolunteerGroupUpdate,
    VolunteerWorkerCreate,
    VolunteerWorkerListResponse,
    VolunteerWorkerOut,
    VolunteerWorkerUpdate,
)

READ_ROLES = (
    "Admin",
    "PublicRelations",
    "OfficeAdmin",
    "SponsorshipCommittee",
    "Registrar",
    "Clerk",
    "FinanceAdmin",
)
WRITE_ROLES = ("Admin", "PublicRelations", "OfficeAdmin")

router = APIRouter(prefix="/volunteers", tags=["volunteers"])


def _get_group(db: Session, group_id: int) -> VolunteerGroup:
    group = db.query(VolunteerGroup).filter(VolunteerGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Volunteer group not found")
    return group


def _get_worker(db: Session, worker_id: int) -> VolunteerWorker:
    worker = (
        db.query(VolunteerWorker)
        .options(joinedload(VolunteerWorker.group))
        .filter(VolunteerWorker.id == worker_id)
        .first()
    )
    if not worker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Volunteer worker not found")
    return worker


@router.get("/groups", response_model=list[VolunteerGroupOut], status_code=status.HTTP_200_OK)
def list_groups(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> list[VolunteerGroupOut]:
    rows = (
        db.query(VolunteerGroup, func.count(VolunteerWorker.id).label("volunteer_count"))
        .outerjoin(VolunteerWorker, VolunteerWorker.group_id == VolunteerGroup.id)
        .group_by(VolunteerGroup.id)
        .order_by(VolunteerGroup.name.asc())
        .all()
    )
    items: list[VolunteerGroupOut] = []
    for group, count in rows:
        items.append(
            VolunteerGroupOut(
                id=group.id,
                name=group.name,
                team_lead_first_name=group.team_lead_first_name,
                team_lead_last_name=group.team_lead_last_name,
                team_lead_phone=group.team_lead_phone,
                team_lead_email=group.team_lead_email,
                volunteer_count=int(count or 0),
                created_at=group.created_at,
                updated_at=group.updated_at,
            )
        )
    return items


@router.post("/groups", response_model=VolunteerGroupOut, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: VolunteerGroupCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> VolunteerGroupOut:
    existing = (
        db.query(VolunteerGroup)
        .filter(func.lower(VolunteerGroup.name) == payload.name.strip().lower())
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Volunteer group already exists")
    group = VolunteerGroup(
        name=payload.name.strip(),
        team_lead_first_name=payload.team_lead_first_name.strip() if payload.team_lead_first_name else None,
        team_lead_last_name=payload.team_lead_last_name.strip() if payload.team_lead_last_name else None,
        team_lead_phone=payload.team_lead_phone.strip() if payload.team_lead_phone else None,
        team_lead_email=payload.team_lead_email,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return VolunteerGroupOut(
        id=group.id,
        name=group.name,
        team_lead_first_name=group.team_lead_first_name,
        team_lead_last_name=group.team_lead_last_name,
        team_lead_phone=group.team_lead_phone,
        team_lead_email=group.team_lead_email,
        volunteer_count=0,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


@router.patch("/groups/{group_id:int}", response_model=VolunteerGroupOut, status_code=status.HTTP_200_OK)
def update_group(
    group_id: int,
    payload: VolunteerGroupUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> VolunteerGroupOut:
    group = _get_group(db, group_id)
    fields_set = payload.__fields_set__

    if "name" in fields_set and payload.name is not None:
        cleaned = payload.name.strip()
        existing = (
            db.query(VolunteerGroup)
            .filter(func.lower(VolunteerGroup.name) == cleaned.lower())
            .filter(VolunteerGroup.id != group.id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Another group already uses this name")
        group.name = cleaned

    if "team_lead_first_name" in fields_set:
        group.team_lead_first_name = payload.team_lead_first_name.strip() if payload.team_lead_first_name else None
    if "team_lead_last_name" in fields_set:
        group.team_lead_last_name = payload.team_lead_last_name.strip() if payload.team_lead_last_name else None
    if "team_lead_phone" in fields_set:
        group.team_lead_phone = payload.team_lead_phone.strip() if payload.team_lead_phone else None
    if "team_lead_email" in fields_set:
        group.team_lead_email = payload.team_lead_email

    db.commit()
    db.refresh(group)
    count = db.query(func.count(VolunteerWorker.id)).filter(VolunteerWorker.group_id == group.id).scalar() or 0
    return VolunteerGroupOut(
        id=group.id,
        name=group.name,
        team_lead_first_name=group.team_lead_first_name,
        team_lead_last_name=group.team_lead_last_name,
        team_lead_phone=group.team_lead_phone,
        team_lead_email=group.team_lead_email,
        volunteer_count=int(count or 0),
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


@router.get("/workers", response_model=VolunteerWorkerListResponse, status_code=status.HTTP_200_OK)
def list_workers(
    *,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    group_id: int | None = Query(None),
    service_type: str | None = Query(None),
    service_month: int | None = Query(None, ge=1, le=12),
    service_year: int | None = Query(None, ge=2000, le=2100),
    q: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> VolunteerWorkerListResponse:
    query = db.query(VolunteerWorker).options(joinedload(VolunteerWorker.group))
    if group_id:
        query = query.filter(VolunteerWorker.group_id == group_id)
    if service_type:
        query = query.filter(VolunteerWorker.service_type == service_type)
    if service_month:
        query = query.filter(func.extract("month", VolunteerWorker.service_date) == service_month)
    if service_year:
        query = query.filter(func.extract("year", VolunteerWorker.service_date) == service_year)
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.filter(
            func.lower(VolunteerWorker.first_name).like(like)
            | func.lower(VolunteerWorker.last_name).like(like)
            | func.lower(func.coalesce(VolunteerWorker.phone, "")).like(like)
        )

    total = query.count()
    items = (
        query.order_by(VolunteerWorker.service_date.desc(), VolunteerWorker.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return VolunteerWorkerListResponse(
        items=[VolunteerWorkerOut.from_orm(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/workers", response_model=VolunteerWorkerOut, status_code=status.HTTP_201_CREATED)
def create_worker(
    payload: VolunteerWorkerCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> VolunteerWorkerOut:
    _ = _get_group(db, payload.group_id)
    worker = VolunteerWorker(
        group_id=payload.group_id,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        phone=payload.phone.strip() if payload.phone else None,
        service_type=payload.service_type,
        service_date=payload.service_date,
        reason=payload.reason,
    )
    db.add(worker)
    db.commit()
    db.refresh(worker)
    worker = _get_worker(db, worker.id)
    return VolunteerWorkerOut.from_orm(worker)


@router.patch("/workers/{worker_id:int}", response_model=VolunteerWorkerOut, status_code=status.HTTP_200_OK)
def update_worker(
    worker_id: int,
    payload: VolunteerWorkerUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> VolunteerWorkerOut:
    worker = _get_worker(db, worker_id)
    fields_set = payload.__fields_set__

    if "group_id" in fields_set and payload.group_id is not None:
        _ = _get_group(db, payload.group_id)
        worker.group_id = payload.group_id
    if "first_name" in fields_set and payload.first_name is not None:
        worker.first_name = payload.first_name.strip()
    if "last_name" in fields_set and payload.last_name is not None:
        worker.last_name = payload.last_name.strip()
    if "phone" in fields_set:
        worker.phone = payload.phone.strip() if payload.phone else None
    if "service_type" in fields_set and payload.service_type is not None:
        worker.service_type = payload.service_type
    if "service_date" in fields_set and payload.service_date is not None:
        worker.service_date = payload.service_date
    if "reason" in fields_set:
        worker.reason = payload.reason

    db.commit()
    db.refresh(worker)
    worker = _get_worker(db, worker.id)
    return VolunteerWorkerOut.from_orm(worker)


@router.delete("/workers/{worker_id:int}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
def delete_worker(
    worker_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*WRITE_ROLES)),
) -> Response:
    worker = _get_worker(db, worker_id)
    db.delete(worker)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
