from __future__ import annotations

from app.core.config import settings


def test_ai_capabilities_returns_catalog(client, authorize, admin_user):
    authorize(admin_user)

    response = client.get("/ai/capabilities")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert any(item["slug"] == "newcomer_follow_up_draft" for item in payload)
    assert any(item["slug"] == "semantic_search" for item in payload)


def test_newcomer_follow_up_draft_returns_503_when_feature_disabled(client, authorize, admin_user, monkeypatch):
    authorize(admin_user)
    monkeypatch.setattr(settings, "AI_ENABLED", False)
    monkeypatch.setattr(settings, "AI_NEWCOMER_FOLLOW_UP_ENABLED", False)

    response = client.post(
        "/ai/drafts/newcomer-follow-up",
        json={
            "primary_contact_name": "Marta",
            "preferred_languages": ["English"],
            "situation_summary": "The family visited on Sunday and asked for follow-up about newcomer support.",
        },
    )

    assert response.status_code == 503, response.text
    assert "not enabled" in response.json()["detail"]


def test_newcomer_follow_up_draft_uses_mock_provider(client, authorize, admin_user, monkeypatch):
    authorize(admin_user)
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_PROVIDER", "mock")
    monkeypatch.setattr(settings, "AI_NEWCOMER_FOLLOW_UP_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DEFAULT_CHAT_MODEL", "Qwen/Qwen3-14B")

    response = client.post(
        "/ai/drafts/newcomer-follow-up",
        json={
            "primary_contact_name": "Marta",
            "household_name": "Marta Family",
            "preferred_languages": ["English", "Amharic"],
            "tone": "warm",
            "situation_summary": (
                "The family recently completed intake and would like a follow-up about membership, children's programs, "
                "and the next available newcomer orientation."
            ),
            "recent_notes": ["They attended liturgy last Sunday."],
            "missing_fields": ["best callback time"],
            "next_steps": ["confirm orientation date", "share children's ministry information"],
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["provider"] == "mock"
    assert payload["model"] == "Qwen/Qwen3-14B"
    assert payload["subject"] == "Follow-up from St. Mary EOTC Edmonton"
    assert "Hello Marta," in payload["content"]
    assert any("Mock provider output" in warning for warning in payload["warnings"])
