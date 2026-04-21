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
    assert "routes to mx1.titan.email, mx2.titan.email" in status.summary


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
