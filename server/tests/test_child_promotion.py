from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.models.member import Child
import app.services.child_promotion as child_promotion_service
from app.services.members_utils import build_mock_member_email


def test_promote_child_assigns_mock_email_and_default_contribution(db_session, sample_member, monkeypatch):
    monkeypatch.setattr(child_promotion_service, "notify_child_turns_eighteen", lambda *args, **kwargs: None)

    child = Child(
        member_id=sample_member.id,
        first_name="Mimi",
        last_name="Tesfaye",
        full_name="Mimi Tesfaye",
        birth_date=date(2000, 1, 1),
    )
    db_session.add(child)
    db_session.commit()
    db_session.refresh(child)

    promoted = child_promotion_service.promote_child(db_session, child=child, actor_id=sample_member.created_by_id)
    db_session.commit()
    db_session.refresh(promoted)
    db_session.refresh(child)

    assert promoted.email == build_mock_member_email(username=promoted.username)
    assert promoted.contribution_amount == Decimal("75.00")
    assert promoted.contribution_currency == "CAD"
    assert child.promoted_at is not None
