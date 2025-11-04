from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.member import Child, Member
from app.models.user import User
from app.schemas.member import (
    ChildPromotionPreviewResponse,
    ChildPromotionResultItem,
    ChildPromotionCandidate,
)
from app.services.child_promotion import get_children_ready_for_promotion, promote_child

READ_ROLES = ("PublicRelations", "Registrar", "Admin", "Clerk", "OfficeAdmin", "FinanceAdmin")
PROMOTE_ROLES = ("Admin", "PublicRelations")

router = APIRouter(prefix="/children", tags=["children"])


@router.get(
    "",
    response_model=ChildPromotionPreviewResponse,
    status_code=status.HTTP_200_OK,
)
def list_children_for_promotion(
    *,
    eligible: bool = Query(default=False),
    since_days: int = Query(default=60, ge=0, le=365),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> ChildPromotionPreviewResponse:
    if not eligible:
        children = (
            db.query(Child)
            .options(selectinload(Child.parent).selectinload(Member.household))
            .order_by(Child.id.asc())
            .limit(50)
            .all()
        )
        candidates: list[ChildPromotionCandidate] = []
        for child in children:
            parent = child.parent
            candidates.append(
                ChildPromotionCandidate(
                    child_id=child.id,
                    child_name=child.full_name,
                    birth_date=child.birth_date,
                    turns_on=child.birth_date or None,
                    parent_member_id=parent.id if parent else 0,
                    parent_member_name=f"{parent.first_name} {parent.last_name}" if parent else "Unknown",
                    household=parent.household if parent else None,
                )
            )
        return ChildPromotionPreviewResponse(items=candidates, total=len(candidates))

    items = []
    for child, turns_on in get_children_ready_for_promotion(db, within_days=since_days):
        parent = child.parent
        items.append(
            ChildPromotionCandidate(
                child_id=child.id,
                child_name=child.full_name,
                birth_date=child.birth_date,
                turns_on=turns_on,
                parent_member_id=parent.id if parent else 0,
                parent_member_name=f"{parent.first_name} {parent.last_name}" if parent else "Unknown",
                household=parent.household if parent else None,
            )
        )
    return ChildPromotionPreviewResponse(items=items, total=len(items))


@router.post(
    "/{child_id}/promote",
    response_model=ChildPromotionResultItem,
    status_code=status.HTTP_200_OK,
)
def promote_single_child(
    child_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*PROMOTE_ROLES)),
) -> ChildPromotionResultItem:
    child = (
        db.query(Child)
        .options(selectinload(Child.parent))
        .filter(Child.id == child_id)
        .with_for_update()
        .first()
    )
    if not child:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")
    if child.promoted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Child already promoted")

    new_member = promote_child(db, child=child, actor_id=current_user.id)
    db.commit()
    db.refresh(child)
    db.refresh(new_member)

    return ChildPromotionResultItem(
        child_id=child.id,
        new_member_id=new_member.id,
        new_member_name=f"{new_member.first_name} {new_member.last_name}",
        promoted_at=child.promoted_at,  # type: ignore[arg-type]
    )
