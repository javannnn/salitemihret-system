from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.core.config import settings
from app.models.member import Member
from app.models.newcomer import Newcomer
from app.models.newcomer_tracking import NewcomerInteraction
from app.models.payment import Payment, PaymentServiceType
from app.models.role import Role
from app.models.sponsorship import Sponsorship
from app.models.user import User
from app.schemas.ai import AIReportQARequest, NewcomerFollowUpDraftRequest
from app.services.ai.models import AIProviderKind, AITextGeneration
from app.services.ai.providers import MockAIProvider
from app.services.ai.service import AIService, AITaskDisabledError


class RecordingAIProvider:
    kind = AIProviderKind.OPENAI_COMPATIBLE

    def __init__(self, content: str = "Broader system response") -> None:
        self.content = content
        self.captured_messages = []

    def is_available(self) -> bool:
        return True

    def generate_text(
        self,
        *,
        model: str,
        messages,
        temperature: float,
        max_tokens: int,
    ) -> AITextGeneration:
        self.captured_messages = messages
        return AITextGeneration(
            provider=self.kind,
            model=model,
            content=self.content,
        )


def test_ai_capabilities_returns_catalog():
    service = AIService(provider=MockAIProvider())

    payload = service.list_capabilities()

    assert any(item.slug == "newcomer_follow_up_draft" for item in payload)
    assert any(item.slug == "semantic_search" for item in payload)
    assert any(item.slug == "report_qa" for item in payload)


def test_newcomer_follow_up_draft_returns_error_when_feature_disabled(monkeypatch):
    monkeypatch.setattr(settings, "AI_ENABLED", False)
    monkeypatch.setattr(settings, "AI_NEWCOMER_FOLLOW_UP_ENABLED", False)
    service = AIService(provider=MockAIProvider())

    with pytest.raises(AITaskDisabledError, match="not enabled"):
        service.draft_newcomer_follow_up(
            NewcomerFollowUpDraftRequest(
                primary_contact_name="Marta",
                preferred_languages=["English"],
                situation_summary="The family visited on Sunday and asked for follow-up about newcomer support.",
            )
        )


def test_newcomer_follow_up_draft_uses_mock_provider(monkeypatch):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_NEWCOMER_FOLLOW_UP_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")
    service = AIService(provider=MockAIProvider())

    payload = service.draft_newcomer_follow_up(
        NewcomerFollowUpDraftRequest(
            primary_contact_name="Marta",
            household_name="Marta Family",
            preferred_languages=["English", "Amharic"],
            tone="warm",
            situation_summary=(
                "The family recently completed intake and would like a follow-up about membership, children's programs, "
                "and the next available newcomer orientation."
            ),
            recent_notes=["They attended liturgy last Sunday."],
            missing_fields=["best callback time"],
            next_steps=["confirm orientation date", "share children's ministry information"],
        )
    )

    assert payload.provider == "mock"
    assert payload.model == "Qwen/Qwen3-14B"
    assert payload.subject == "Follow-up from St. Mary EOTC Edmonton"
    assert "Hello Marta," in payload.content
    assert any("Mock provider output" in warning for warning in payload.warnings)


def test_report_qa_returns_error_when_feature_disabled(db_session, admin_user, monkeypatch):
    monkeypatch.setattr(settings, "AI_ENABLED", False)
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", False)
    service = AIService(provider=MockAIProvider())

    with pytest.raises(AITaskDisabledError, match="not enabled"):
        service.answer_report_question(
            db_session,
            user=admin_user,
            payload=AIReportQARequest(question="What stands out in the reports?", modules=["members"]),
        )


def test_report_qa_uses_mock_provider_and_returns_sources_and_chart(
    db_session,
    admin_user,
    sample_member,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")
    service = AIService(provider=MockAIProvider())

    service_type = PaymentServiceType(code="DONATION", label="General Donation", active=True)
    db_session.add(service_type)
    db_session.flush()
    db_session.add(
        Member(
            first_name="Selam",
            last_name="Kebede",
            username="selam.kebede",
            email="selam.kebede@example.com",
            status="Pending",
            phone=None,
            pays_contribution=False,
        )
    )
    db_session.add(
        Payment(
            amount=Decimal("450.00"),
            currency="CAD",
            method="CASH",
            service_type_id=service_type.id,
            member_id=sample_member.id,
            recorded_by_id=admin_user.id,
            posted_at=datetime(2026, 3, 1, 10, 30, 0),
            status="Completed",
        )
    )
    db_session.commit()

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="Which payment service is leading revenue, and what stands out in the member roster?",
            modules=["payments", "members"],
        ),
    )

    assert payload.provider == "mock"
    assert payload.model == "Qwen/Qwen3-14B"
    assert payload.applied_modules == ["payments", "members"]
    assert payload.chart is not None
    assert payload.chart.title == "Revenue by service type"
    assert payload.chart.unit == "currency"
    assert any(source.id == "payments_summary" for source in payload.sources)
    assert any(source.id == "members_overview" for source in payload.sources)
    assert "Operational snapshot" in payload.answer
    assert "Payments:" in payload.answer
    assert "Members:" in payload.answer
    assert "Priority:" in payload.answer
    assert any("Mock provider output" in warning for warning in payload.warnings)


def test_report_qa_includes_richer_newcomer_report_context(
    db_session,
    registrar_user,
    sample_member,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")
    service = AIService(provider=MockAIProvider())

    today = date.today()
    newcomer = Newcomer(
        newcomer_code="NC-AI1001",
        first_name="Mimi",
        last_name="Tadesse",
        contact_phone="+16135550141",
        contact_email="mimi@example.com",
        arrival_date=today - timedelta(days=12),
        created_at=datetime.utcnow() - timedelta(days=12),
        status="Assigned",
        assigned_owner_id=registrar_user.id,
        followup_due_date=today - timedelta(days=1),
        preferred_language="Amharic",
        interpreter_required=True,
    )
    db_session.add(newcomer)
    db_session.flush()
    db_session.add(
        NewcomerInteraction(
            newcomer_id=newcomer.id,
            interaction_type="Call",
            note="Discussed next newcomer support steps.",
            created_by_id=registrar_user.id,
            occurred_at=datetime.utcnow() - timedelta(days=1),
        )
    )
    db_session.add(
        Sponsorship(
            sponsor_member_id=sample_member.id,
            newcomer_id=newcomer.id,
            beneficiary_name=newcomer.full_name,
            start_date=today - timedelta(days=7),
            status="Submitted",
            monthly_amount=Decimal("75.00"),
        )
    )
    db_session.commit()

    payload = service.answer_report_question(
        db_session,
        user=registrar_user,
        payload=AIReportQARequest(
            question="What stands out in newcomer follow-up and recent activity?",
            modules=["newcomers", "activity"],
        ),
    )

    assert payload.provider == "mock"
    assert payload.applied_modules == ["newcomers", "activity"]
    if payload.chart is not None:
        assert payload.chart.title in {"Newcomer pipeline", "Recent activity by category"}
    assert any(source.id == "newcomers_overview" for source in payload.sources)
    assert any(source.id == "activity_feed" for source in payload.sources)
    assert any(
        source.id == "newcomers_overview"
        and any(metric.label == "Overdue follow-ups" for metric in source.metrics)
        for source in payload.sources
    )
    assert "follow-up" in payload.answer.lower() or "follow-ups" in payload.answer.lower()


def test_report_qa_excludes_report_modules_hidden_by_report_permissions(
    db_session,
    sample_member,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")
    service = AIService(provider=MockAIProvider())

    focused_role = Role(
        name="FocusedReporter",
        module_permissions={
            "reports": {"read": True, "write": False},
            "members": {"read": True, "write": False},
            "payments": {"read": True, "write": False},
        },
        field_permissions={
            "reports": {
                "members": {"read": True, "write": False},
                "payments": {"read": False, "write": False},
            }
        },
    )
    focused_user = User(
        email="focused.reporter@example.com",
        username="focused.reporter",
        full_name="Focused Reporter",
        hashed_password="hash",
        is_active=True,
    )
    focused_user.roles.append(focused_role)
    db_session.add(
        Member(
            first_name="Selam",
            last_name="Kebede",
            username="selam.kebede",
            email="selam.kebede@example.com",
            status="Pending",
            phone=None,
            pays_contribution=False,
        )
    )
    db_session.commit()

    payload = service.answer_report_question(
        db_session,
        user=focused_user,
        payload=AIReportQARequest(
            question="Which payment service is leading revenue, and what stands out in the member roster?",
            modules=["payments", "members"],
        ),
    )

    assert payload.applied_modules == ["members"]
    assert any("Payments" in warning for warning in payload.warnings)


def test_report_qa_answers_top_categories_from_follow_up_history(
    db_session,
    admin_user,
    sample_member,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")
    service = AIService(provider=MockAIProvider())

    monthly = PaymentServiceType(code="MONTHLY", label="Monthly Contribution", active=True)
    donation = PaymentServiceType(code="DONATION", label="General Donation", active=True)
    tithe = PaymentServiceType(code="TITHE", label="Tithe", active=True)
    db_session.add_all([monthly, donation, tithe])
    db_session.flush()
    db_session.add_all(
        [
            Payment(
                amount=Decimal("600.00"),
                currency="CAD",
                method="CASH",
                service_type_id=monthly.id,
                member_id=sample_member.id,
                recorded_by_id=admin_user.id,
                posted_at=datetime(2026, 3, 1, 10, 30, 0),
                status="Completed",
            ),
            Payment(
                amount=Decimal("300.00"),
                currency="CAD",
                method="CASH",
                service_type_id=donation.id,
                member_id=sample_member.id,
                recorded_by_id=admin_user.id,
                posted_at=datetime(2026, 3, 2, 10, 30, 0),
                status="Completed",
            ),
            Payment(
                amount=Decimal("75.00"),
                currency="CAD",
                method="CASH",
                service_type_id=tithe.id,
                member_id=sample_member.id,
                recorded_by_id=admin_user.id,
                posted_at=datetime(2026, 3, 3, 10, 30, 0),
                status="Completed",
            ),
        ]
    )
    db_session.commit()

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="What are the top categories?",
            history=[
                {"role": "user", "content": "Give me a quick operational summary."},
                {
                    "role": "assistant",
                    "content": "Payments: Revenue totals CAD 975.00 across 3 service categories, led by Monthly Contribution at CAD 600.00.",
                },
            ],
            modules=["payments", "members"],
        ),
    )

    assert payload.answer == (
        "The top payment categories for the current snapshot are Monthly Contribution (CAD 600.00), "
        "General Donation (CAD 300.00), Tithe (CAD 75.00)."
    )
    assert payload.chart is not None
    assert payload.chart.title == "Revenue by service type"


def test_report_qa_answers_active_payers_directly(
    db_session,
    admin_user,
    sample_member,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")
    service = AIService(provider=MockAIProvider())

    db_session.add(
        Member(
            first_name="Selam",
            last_name="Kebede",
            username="selam.kebede",
            email="selam.kebede@example.com",
            status="Active",
            phone="+16135550111",
            pays_contribution=True,
        )
    )
    db_session.add(
        Member(
            first_name="Rahel",
            last_name="Bekele",
            username="rahel.bekele",
            email="rahel.bekele@example.com",
            status="Pending",
            phone="+16135550112",
            pays_contribution=True,
        )
    )
    db_session.commit()

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(question="How many members are active payers?", modules=["members"]),
    )

    assert payload.answer == "There are 2 active members marked as paying contribution for the current snapshot."
    assert payload.chart is None


def test_report_qa_omits_chart_for_general_summary(
    db_session,
    admin_user,
    sample_member,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")
    service = AIService(provider=MockAIProvider())

    service_type = PaymentServiceType(code="MONTHLY", label="Monthly Contribution", active=True)
    db_session.add(service_type)
    db_session.flush()
    db_session.add(
        Payment(
            amount=Decimal("600.00"),
            currency="CAD",
            method="CASH",
            service_type_id=service_type.id,
            member_id=sample_member.id,
            recorded_by_id=admin_user.id,
            posted_at=datetime(2026, 3, 1, 10, 30, 0),
            status="Completed",
        )
    )
    db_session.commit()

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(question="Give me a quick operational summary.", modules=["payments", "members"]),
    )

    assert "Operational snapshot" in payload.answer
    assert payload.chart is None


def test_report_qa_answers_sponsorship_budget_as_capacity(
    db_session,
    admin_user,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")
    service = AIService(provider=MockAIProvider())

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="What is the budget in sponsorship? I understand it isn't monetary",
            modules=["sponsorships"],
        ),
    )

    assert payload.answer.startswith("In sponsorships, budget refers to case capacity rather than money")
    assert payload.chart is None
    assert len(payload.sources) == 1
    assert payload.sources[0].module == "sponsorships"


def test_report_qa_returns_member_non_payer_comparison_chart(
    db_session,
    admin_user,
    sample_member,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")
    service = AIService(provider=MockAIProvider())

    db_session.add(
        Member(
            first_name="Hana",
            last_name="Bekele",
            username="hana.bekele",
            email="hana.bekele@example.com",
            status="Pending",
            phone="+16135550113",
            pays_contribution=False,
        )
    )
    db_session.commit()

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="Show me a chart that shows active members vs non paying members",
            modules=["members"],
        ),
    )

    assert "1 active member versus 1 member not marked as paying contribution" in payload.answer
    assert payload.chart is not None
    assert payload.chart.title == "Active members vs non-paying members"
    assert [datum.label for datum in payload.chart.data] == ["Active members", "Non-paying members"]
    assert len(payload.sources) == 1
    assert payload.sources[0].module == "members"


def test_report_qa_answers_revenue_without_leaking_prior_chart_context(
    db_session,
    admin_user,
    sample_member,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")
    service = AIService(provider=MockAIProvider())

    monthly = PaymentServiceType(code="MONTHLY", label="Monthly Contribution", active=True)
    donation = PaymentServiceType(code="DONATION", label="General Donation", active=True)
    db_session.add_all([monthly, donation])
    db_session.flush()
    db_session.add_all(
        [
            Payment(
                amount=Decimal("600.00"),
                currency="CAD",
                method="CASH",
                service_type_id=monthly.id,
                member_id=sample_member.id,
                recorded_by_id=admin_user.id,
                posted_at=datetime(2026, 3, 1, 10, 30, 0),
                status="Completed",
            ),
            Payment(
                amount=Decimal("375.00"),
                currency="CAD",
                method="CASH",
                service_type_id=donation.id,
                member_id=sample_member.id,
                recorded_by_id=admin_user.id,
                posted_at=datetime(2026, 3, 2, 10, 30, 0),
                status="Completed",
            ),
        ]
    )
    db_session.commit()

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="How much money did we make this month",
            history=[{"role": "user", "content": "Show me a chart that shows active members vs non paying members"}],
            modules=["members", "payments"],
        ),
    )

    assert payload.answer == (
        "Total recorded revenue for the current snapshot is CAD 975.00. "
        "The leading service is Monthly Contribution at CAD 600.00."
    )
    assert payload.chart is None
    assert len(payload.sources) == 1
    assert payload.sources[0].module == "payments"


def test_report_qa_names_top_payer_and_transactions(
    db_session,
    admin_user,
    sample_member,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")
    service = AIService(provider=MockAIProvider())

    donation = PaymentServiceType(code="DONATION", label="General Donation", active=True)
    db_session.add(donation)
    db_session.flush()
    db_session.add(
        Member(
            first_name="Selam",
            last_name="Kebede",
            username="selam.kebede",
            email="selam.kebede@example.com",
            status="Active",
            phone="+16135550114",
            pays_contribution=True,
        )
    )
    db_session.flush()
    selam = db_session.query(Member).filter(Member.username == "selam.kebede").one()
    db_session.add_all(
        [
            Payment(
                amount=Decimal("400.00"),
                currency="CAD",
                method="CASH",
                service_type_id=donation.id,
                member_id=sample_member.id,
                recorded_by_id=admin_user.id,
                posted_at=datetime(2026, 3, 1, 10, 30, 0),
                status="Completed",
            ),
            Payment(
                amount=Decimal("200.00"),
                currency="CAD",
                method="CASH",
                service_type_id=donation.id,
                member_id=sample_member.id,
                recorded_by_id=admin_user.id,
                posted_at=datetime(2026, 3, 2, 10, 30, 0),
                status="Completed",
            ),
            Payment(
                amount=Decimal("300.00"),
                currency="CAD",
                method="CASH",
                service_type_id=donation.id,
                member_id=selam.id,
                recorded_by_id=admin_user.id,
                posted_at=datetime(2026, 3, 3, 10, 30, 0),
                status="Completed",
            ),
        ]
    )
    db_session.commit()

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="who is the top paying member with the most transactions",
            modules=["payments"],
        ),
    )

    assert payload.answer == (
        "Abeba Tesfaye is the leading recorded payer for the current snapshot with CAD 600.00 across 2 transactions."
    )
    assert payload.chart is None
    assert len(payload.sources) == 1
    assert payload.sources[0].module == "payments"


def test_report_qa_names_top_payer_without_chart_on_follow_up(
    db_session,
    admin_user,
    sample_member,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")
    service = AIService(provider=MockAIProvider())

    donation = PaymentServiceType(code="DONATION", label="General Donation", active=True)
    db_session.add(donation)
    db_session.flush()
    db_session.add(
        Payment(
            amount=Decimal("600.00"),
            currency="CAD",
            method="CASH",
            service_type_id=donation.id,
            member_id=sample_member.id,
            recorded_by_id=admin_user.id,
            posted_at=datetime(2026, 3, 1, 10, 30, 0),
            status="Completed",
        )
    )
    db_session.commit()

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="name him don't show chart",
            history=[{"role": "user", "content": "who is the top paying member with the most transactions"}],
            modules=["payments"],
        ),
    )

    assert payload.answer == "It is Abeba Tesfaye, with CAD 600.00 across 1 transaction for the current snapshot."
    assert payload.chart is None
    assert len(payload.sources) == 1
    assert payload.sources[0].module == "payments"


def test_report_qa_handles_short_clarification_prompts(
    db_session,
    admin_user,
    sample_member,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")
    service = AIService(provider=MockAIProvider())

    service_type = PaymentServiceType(code="MONTHLY", label="Monthly Contribution", active=True)
    db_session.add(service_type)
    db_session.flush()
    db_session.add(
        Payment(
            amount=Decimal("600.00"),
            currency="CAD",
            method="CASH",
            service_type_id=service_type.id,
            member_id=sample_member.id,
            recorded_by_id=admin_user.id,
            posted_at=datetime(2026, 3, 1, 10, 30, 0),
            status="Completed",
        )
    )
    db_session.commit()

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="?",
            history=[{"role": "user", "content": "What are the top categories?"}],
            modules=["payments"],
        ),
    )

    assert payload.answer == "The top payment categories for the current snapshot are Monthly Contribution (CAD 600.00)."


def test_report_qa_requires_confirmation_for_broader_system_question(
    db_session,
    admin_user,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "openai_compatible")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "qwen2.5-3b-instruct-q4_k_m")
    provider = RecordingAIProvider()
    service = AIService(provider=provider)

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="How do I reset a user's password?",
            modules=["members"],
        ),
    )

    assert payload.status == "confirmation_required"
    assert payload.confirmation is not None
    assert payload.confirmation.mode == "broader_system_context"
    assert "beyond the live report data" in payload.answer
    assert payload.confirmation.title == "Want me to take a broader look?"
    assert provider.captured_messages == []


def test_report_qa_answers_from_broader_system_context_after_confirmation(
    db_session,
    admin_user,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "openai_compatible")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "qwen2.5-3b-instruct-q4_k_m")
    provider = RecordingAIProvider(content="Use the users and auth endpoints for account recovery steps.")
    service = AIService(provider=provider)

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="How do I reset a user's password?",
            modules=["members"],
            allow_broader_system_context=True,
        ),
    )

    assert payload.status == "answered"
    assert payload.answer == "Use the users and auth endpoints for account recovery steps."
    assert payload.chart is None
    assert payload.sources == []
    assert any("Broader system answer uses approved API/schema metadata" in warning for warning in payload.warnings)
    assert provider.captured_messages
    assert "Broader system metadata JSON" in provider.captured_messages[-1].content
    assert "How do I reset a user's password?" in provider.captured_messages[-1].content


def test_report_qa_answers_user_management_features_in_plain_language(
    db_session,
    admin_user,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "openai_compatible")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "qwen2.5-3b-instruct-q4_k_m")
    provider = RecordingAIProvider(content="This should not be used for the curated user-management answer.")
    service = AIService(provider=provider)

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="what are the features of the user management module and can I edit role and permissions there?",
            modules=["members"],
            allow_broader_system_context=True,
        ),
    )

    assert payload.provider == "system_guide"
    assert payload.model == "product-metadata"
    assert "User Management is where you handle staff accounts and access." in payload.answer
    assert "You can create users, send invitations" in payload.answer
    assert "Yes. You can change which roles a user has from the Users side." in payload.answer
    assert "To change what a role is allowed to do, open Roles & Permissions inside User Management." in payload.answer
    assert "Super Admin access is required." in payload.answer
    assert provider.captured_messages == []


def test_report_qa_requires_confirmation_for_payments_gateway_system_question(
    db_session,
    admin_user,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "openai_compatible")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "qwen2.5-3b-instruct-q4_k_m")
    provider = RecordingAIProvider()
    service = AIService(provider=provider)

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="List the features in the payments gateway",
            modules=["payments"],
        ),
    )

    assert payload.status == "confirmation_required"
    assert payload.confirmation is not None
    assert provider.captured_messages == []


def test_report_qa_answers_payments_gateway_features_from_system_guide(
    db_session,
    admin_user,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "openai_compatible")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "qwen2.5-3b-instruct-q4_k_m")
    provider = RecordingAIProvider(content="This should not be used for the curated payments answer.")
    service = AIService(provider=provider)

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="List the features in the payments gateway",
            modules=["payments"],
            allow_broader_system_context=True,
        ),
    )

    assert payload.provider == "system_guide"
    assert payload.model == "product-metadata"
    assert "Payments is the finance workspace for reviewing the ledger and managing contribution records." in payload.answer
    assert "record payments, post corrections, filter the ledger" in payload.answer
    assert "member's payment timeline" in payload.answer
    assert "Finance Admin or Admin can record, correct, and manage payment actions." in payload.answer
    assert provider.captured_messages == []


def test_report_qa_requires_confirmation_for_members_workflow_question(
    db_session,
    admin_user,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "openai_compatible")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "qwen2.5-3b-instruct-q4_k_m")
    provider = RecordingAIProvider()
    service = AIService(provider=provider)

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="Does the system automatically inform me if a child is turning 18 soon? does it automatically convert it to a member? explain",
            modules=["members"],
        ),
    )

    assert payload.status == "confirmation_required"
    assert payload.confirmation is not None
    assert payload.confirmation.mode == "broader_system_context"
    assert provider.captured_messages == []


def test_report_qa_answers_members_promotion_workflow_from_system_guide(
    db_session,
    admin_user,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "openai_compatible")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "qwen2.5-3b-instruct-q4_k_m")
    provider = RecordingAIProvider(content="This should not be used for the curated promotions answer.")
    service = AIService(provider=provider)

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="Does the system automatically inform me if a child is turning 18 soon? does it automatically convert it to a member? explain",
            modules=["members"],
            allow_broader_system_context=True,
        ),
    )

    assert payload.provider == "system_guide"
    assert payload.model == "product-metadata"
    assert "In Members, there is a promotion workflow for children who are approaching 18." in payload.answer
    assert "can show an upcoming promotions list" in payload.answer
    assert "does not silently convert a child into a member" in payload.answer
    assert "creates the new member record" in payload.answer
    assert "promotion notification is sent" in payload.answer
    assert provider.captured_messages == []


def test_report_qa_routes_module_correction_follow_up_to_broader_system_context(
    db_session,
    admin_user,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "openai_compatible")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "qwen2.5-3b-instruct-q4_k_m")
    provider = RecordingAIProvider()
    service = AIService(provider=provider)

    payload = service.answer_report_question(
        db_session,
        user=admin_user,
        payload=AIReportQARequest(
            question="No not in user management module in members module obviously",
            history=[
                {
                    "role": "user",
                    "content": "what are the features of the user management module and can I edit role and permissions there?",
                }
            ],
            modules=["members"],
        ),
    )

    assert payload.status == "confirmation_required"
    assert payload.confirmation is not None
    assert provider.captured_messages == []


def test_report_qa_omits_blocked_modules_for_partial_access(
    db_session,
    public_relations_user,
    sample_member,
    monkeypatch,
):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_REPORT_QA_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")
    service = AIService(provider=MockAIProvider())

    payload = service.answer_report_question(
        db_session,
        user=public_relations_user,
        payload=AIReportQARequest(
            question="Summarize finance and member risks.",
            modules=["payments", "members"],
        ),
    )

    assert payload.applied_modules == ["members"]
    assert all(source.module == "members" for source in payload.sources)
    assert any("omitted due to permissions" in warning for warning in payload.warnings)
