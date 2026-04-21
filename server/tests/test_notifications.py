from __future__ import annotations

from app.services import notifications


def test_app_url_uses_public_frontend_base_url(monkeypatch):
    monkeypatch.setattr(
        notifications.settings,
        "FRONTEND_BASE_URL",
        "https://demo.ace-tech-software.com",
    )

    assert notifications._app_url("/members") == "https://demo.ace-tech-software.com/members"
    assert notifications.frontend_url_is_public() is True
    assert notifications.frontend_url_warning() is None


def test_build_email_delivery_details_uses_public_login_url(monkeypatch):
    monkeypatch.setattr(
        notifications.settings,
        "FRONTEND_BASE_URL",
        "https://demo.ace-tech-software.com",
    )

    payload = notifications.build_email_delivery_details(
        recipient="admin@example.com",
        accepted=True,
    )

    assert payload["login_url"] == "https://demo.ace-tech-software.com/login"
    assert payload["login_url_public"] is True
    assert payload["warning"] is None
