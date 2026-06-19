from __future__ import annotations

import pytest

from app.services import email_client


class _FakeImapClient:
    def logout(self) -> None:
        return None

@pytest.fixture(autouse=True)
def clear_mx_cache() -> None:
    email_client._lookup_public_mx_hosts.cache_clear()
    yield
    email_client._lookup_public_mx_hosts.cache_clear()


def test_get_inbox_status_detects_public_mx_mismatch(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(email_client.settings, "EMAIL_FROM_ADDRESS", "info@stmaryeotcedmonton.org")
    monkeypatch.setattr(email_client.settings, "EMAIL_IMAP_HOST", "stmaryeotcedmonton.org")
    monkeypatch.setattr(email_client.settings, "EMAIL_IMAP_PORT", 993)
    monkeypatch.setattr(email_client.settings, "EMAIL_IMAP_USERNAME", "info@stmaryeotcedmonton.org")
    monkeypatch.setattr(email_client.settings, "EMAIL_IMAP_PASSWORD", "secret")
    monkeypatch.setattr(email_client, "_connect_imap", lambda: _FakeImapClient())
    monkeypatch.setattr(
        email_client,
        "_lookup_public_mx_hosts",
        lambda domain: ("mx1.titan.email", "mx2.titan.email"),
    )

    status = email_client.get_inbox_status()

    assert status.state == "mx_mismatch"
    assert status.inbox_accessible is True
    assert status.inbound_ready is False
    assert status.public_mx_hosts == ["mx1.titan.email", "mx2.titan.email"]
    assert "different provider" in status.summary


def test_get_inbox_status_reports_ready_when_public_route_aligns(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(email_client.settings, "EMAIL_FROM_ADDRESS", "info@stmaryeotcedmonton.org")
    monkeypatch.setattr(email_client.settings, "EMAIL_IMAP_HOST", "imap.titan.email")
    monkeypatch.setattr(email_client.settings, "EMAIL_IMAP_PORT", 993)
    monkeypatch.setattr(email_client.settings, "EMAIL_IMAP_USERNAME", "info@stmaryeotcedmonton.org")
    monkeypatch.setattr(email_client.settings, "EMAIL_IMAP_PASSWORD", "secret")
    monkeypatch.setattr(email_client, "_connect_imap", lambda: _FakeImapClient())
    monkeypatch.setattr(
        email_client,
        "_lookup_public_mx_hosts",
        lambda domain: ("mx1.titan.email", "mx2.titan.email"),
    )

    status = email_client.get_inbox_status()

    assert status.state == "ready"
    assert status.inbox_accessible is True
    assert status.inbound_ready is True
    assert status.imap_host == "imap.titan.email"


def test_send_email_returns_service_unavailable_when_smtp_cannot_connect(
    client,
    authorize,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    from app.models.user import User

    super_admin = User(
        email="super.admin@example.com",
        username="super.admin",
        full_name="Super Admin",
        hashed_password="hash",
        is_active=True,
        is_super_admin=True,
    )
    db_session.add(super_admin)
    db_session.commit()
    db_session.refresh(super_admin)
    authorize(super_admin)
    monkeypatch.setattr(email_client, "send_email", lambda **kwargs: (False, []))

    response = client.post(
        "/emails/send",
        json={
            "to": ["recipient@example.com"],
            "subject": "Test message",
            "body_text": "Hello from tests",
        },
    )

    assert response.status_code == 503
    assert "SMTP connection is unavailable" in response.text


def test_send_email_returns_refused_recipients_when_some_addresses_fail(
    client,
    authorize,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    from app.models.user import User

    super_admin = User(
        email="super.admin@example.com",
        username="super.admin",
        full_name="Super Admin",
        hashed_password="hash",
        is_active=True,
        is_super_admin=True,
    )
    db_session.add(super_admin)
    db_session.commit()
    db_session.refresh(super_admin)
    authorize(super_admin)
    monkeypatch.setattr(email_client, "send_email", lambda **kwargs: (True, ["bad@example.com"]))

    response = client.post(
        "/emails/send",
        json={
            "to": ["recipient@example.com"],
            "subject": "Test message",
            "body_text": "Hello from tests",
        },
    )

    assert response.status_code == 202
    assert response.json()["status"] == "accepted"
    assert response.json()["refused"] == ["bad@example.com"]
