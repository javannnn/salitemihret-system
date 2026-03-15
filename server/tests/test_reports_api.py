from __future__ import annotations

from datetime import UTC, datetime

from app.models.member_audit import MemberAudit
from app.models.user import UserAuditActionEnum, UserAuditLog


def test_report_activity_returns_member_events_without_crashing(
    client,
    authorize,
    admin_user,
    db_session,
    sample_member,
):
    db_session.add(
        MemberAudit(
            member_id=sample_member.id,
            field="status",
            old_value="Pending",
            new_value="Active",
            changed_by_id=admin_user.id,
            changed_at=datetime(2026, 3, 12, 9, 30, 0),
        )
    )
    db_session.add(
        UserAuditLog(
            actor_user_id=admin_user.id,
            action=UserAuditActionEnum.USER_CREATED,
            target_user_id=admin_user.id,
            created_at=datetime(2026, 3, 12, 10, 0, 0, tzinfo=UTC),
        )
    )
    db_session.commit()

    authorize(admin_user)
    response = client.get("/reports/activity?limit=25")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 2
    assert payload[0]["category"] == "user"
    assert payload[0]["target"] == "Admin"
    assert payload[1]["category"] == "member"
    assert payload[1]["action"] == "Status changed"
    assert payload[1]["target"] == "Abeba Tesfaye"
    assert payload[0]["occurred_at"].endswith("Z") or payload[0]["occurred_at"].endswith("+00:00")
    assert payload[1]["occurred_at"].endswith("Z") or payload[1]["occurred_at"].endswith("+00:00")
