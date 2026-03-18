from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from app.models.member_audit import MemberAudit
from app.models.newcomer import Newcomer
from app.models.newcomer_tracking import NewcomerInteraction, NewcomerStatusAudit
from app.models.sponsorship import Sponsorship
from app.models.user import UserAuditActionEnum, UserAuditLog
from app.services import reporting as reporting_service


def test_report_activity_returns_member_events_without_crashing(
    admin_user,
    db_session,
    sample_member,
):
    today = date.today()
    newcomer = Newcomer(
        newcomer_code="NC-REPORT01",
        first_name="Marta",
        last_name="Bekele",
        contact_phone="+16135550121",
        contact_email="marta@example.com",
        arrival_date=today - timedelta(days=10),
        status="Assigned",
        assigned_owner_id=admin_user.id,
        followup_due_date=today + timedelta(days=2),
    )
    db_session.add(newcomer)
    db_session.flush()
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
    db_session.add(
        NewcomerStatusAudit(
            newcomer_id=newcomer.id,
            action="StatusChange",
            from_status="Contacted",
            to_status="Assigned",
            changed_by_id=admin_user.id,
            changed_at=datetime(2026, 3, 12, 11, 0, 0),
        )
    )
    db_session.add(
        NewcomerInteraction(
            newcomer_id=newcomer.id,
            interaction_type="Call",
            note="Reached the family and confirmed next visit.",
            created_by_id=admin_user.id,
            occurred_at=datetime(2026, 3, 12, 10, 45, 0),
        )
    )
    db_session.commit()

    payload = reporting_service.get_report_activity(db_session, limit=25)
    assert len(payload) == 4
    assert payload[0].category == "newcomer"
    assert payload[0].action == "Status changed"
    assert payload[0].target == "Marta Bekele"
    assert payload[1].category == "newcomer"
    assert payload[1].action == "Call logged"
    assert payload[2].category == "user"
    assert payload[2].target == "Admin"
    assert payload[3].category == "member"
    assert payload[3].action == "Status changed"
    assert payload[3].target == "Abeba Tesfaye"
    assert payload[0].occurred_at.tzinfo is not None
    assert payload[3].occurred_at.tzinfo is not None


def test_newcomer_report_returns_followup_and_support_breakdowns(
    registrar_user,
    db_session,
    sample_member,
):
    today = date.today()
    first_newcomer = Newcomer(
        newcomer_code="NC-REP1001",
        first_name="Hana",
        last_name="Tesfaye",
        contact_phone="+16135550131",
        contact_email="hana@example.com",
        arrival_date=today - timedelta(days=18),
        created_at=datetime.utcnow() - timedelta(days=18),
        status="Assigned",
        preferred_language="Amharic",
        referred_by="Sunday Visitor",
        county="Edmonton",
        interpreter_required=True,
        followup_due_date=today - timedelta(days=2),
    )
    second_newcomer = Newcomer(
        newcomer_code="NC-REP1002",
        first_name="Rahel",
        last_name="Kebede",
        contact_phone="+16135550132",
        contact_email="rahel@example.com",
        arrival_date=today - timedelta(days=6),
        created_at=datetime.utcnow() - timedelta(days=6),
        status="Settled",
        preferred_language="English",
        referred_by="Friend",
        county="Edmonton",
        sponsored_by_member_id=sample_member.id,
        assigned_owner_id=registrar_user.id,
        household_type="Family",
        family_size=4,
        followup_due_date=today + timedelta(days=3),
        service_type="Settlement support",
    )
    db_session.add_all([first_newcomer, second_newcomer])
    db_session.flush()
    db_session.add(
        NewcomerInteraction(
            newcomer_id=second_newcomer.id,
            interaction_type="Visit",
            note="Completed a settlement visit.",
            created_by_id=registrar_user.id,
            occurred_at=datetime.utcnow() - timedelta(days=1),
        )
    )
    db_session.add(
        Sponsorship(
            sponsor_member_id=sample_member.id,
            newcomer_id=second_newcomer.id,
            beneficiary_name=second_newcomer.full_name,
            start_date=today - timedelta(days=5),
            status="Active",
            monthly_amount=Decimal("75.00"),
        )
    )
    db_session.commit()

    payload = reporting_service.get_newcomer_report(db_session)
    assert payload.summary.total_cases == 2
    assert payload.summary.open_cases == 2
    assert payload.summary.followups_overdue == 1
    assert payload.summary.followups_due_next_7_days == 1
    assert payload.summary.unassigned_cases == 1
    assert payload.summary.interpreter_required_cases == 1
    assert payload.summary.family_households == 1
    assert payload.summary.active_support_cases == 1
    assert payload.status_breakdown[2].label == "Assigned"
    assert payload.status_breakdown[2].value == 1
    assert payload.status_breakdown[4].label == "Settled"
    assert payload.status_breakdown[4].value == 1
    assert any(item.label == "Edmonton" and item.value == 2 for item in payload.county_breakdown)
    assert any(item.owner_name == "Unassigned" and item.total_cases == 1 for item in payload.owner_breakdown)
    assert payload.attention_cases[0].full_name == "Hana Tesfaye"
    assert payload.attention_cases[0].attention_reason is not None
    assert "Follow-up overdue" in payload.attention_cases[0].attention_reason
