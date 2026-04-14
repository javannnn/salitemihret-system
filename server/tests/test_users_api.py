from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.auth.security import hash_password
from app.models.user import User, UserMemberLink


def test_list_users_allows_linked_members_with_placeholder_email(
    client,
    authorize,
    db_session,
    sample_member,
):
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

    sample_member.email = "mock+member-6@example.invalid"
    super_admin.member_link = UserMemberLink(member_id=sample_member.id, status="linked")
    db_session.add_all([sample_member, super_admin])
    db_session.commit()

    authorize(super_admin)
    response = client.get("/users")

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["member"]["email"] == "mock+member-6@example.invalid"


def test_suspend_user_blocks_login_until_unsuspended(client, authorize, db_session):
    super_admin = User(
        email="super.admin@example.com",
        username="super.admin",
        full_name="Super Admin",
        hashed_password="hash",
        is_active=True,
        is_super_admin=True,
    )
    target = User(
        email="person@example.com",
        username="person.user",
        full_name="Person User",
        hashed_password=hash_password("TestPass123!"),
        is_active=True,
    )
    db_session.add_all([super_admin, target])
    db_session.commit()
    db_session.refresh(super_admin)
    db_session.refresh(target)

    authorize(super_admin)
    suspended_until = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    suspend_response = client.post(
        f"/users/{target.id}/suspend",
        json={"suspended_until": suspended_until, "reason": "Investigating unusual activity"},
    )

    assert suspend_response.status_code == 200, suspend_response.text
    assert suspend_response.json()["lifecycle_status"] == "suspended"

    login_response = client.post(
        "/auth/login",
        json={"email": target.email, "password": "TestPass123!"},
    )
    assert login_response.status_code == 403, login_response.text
    assert "suspended until" in login_response.json()["detail"].lower()

    unsuspend_response = client.post(f"/users/{target.id}/unsuspend")
    assert unsuspend_response.status_code == 200, unsuspend_response.text
    assert unsuspend_response.json()["lifecycle_status"] == "active"

    restored_login = client.post(
        "/auth/login",
        json={"email": target.email, "password": "TestPass123!"},
    )
    assert restored_login.status_code == 200, restored_login.text
    assert restored_login.json()["access_token"]


def test_delete_and_restore_user_requires_reactivation(client, authorize, db_session):
    super_admin = User(
        email="super.admin@example.com",
        username="super.admin",
        full_name="Super Admin",
        hashed_password="hash",
        is_active=True,
        is_super_admin=True,
    )
    target = User(
        email="restore.me@example.com",
        username="restore.me",
        full_name="Restore Me",
        hashed_password=hash_password("RestorePass123!"),
        is_active=True,
    )
    db_session.add_all([super_admin, target])
    db_session.commit()
    db_session.refresh(super_admin)
    db_session.refresh(target)

    authorize(super_admin)
    delete_response = client.request(
        "DELETE",
        f"/users/{target.id}",
        json={"reason": "Former staff"},
    )
    assert delete_response.status_code == 200, delete_response.text
    deleted_payload = delete_response.json()
    assert deleted_payload["lifecycle_status"] == "deleted"
    assert deleted_payload["is_active"] is False

    deleted_login = client.post(
        "/auth/login",
        json={"email": target.email, "password": "RestorePass123!"},
    )
    assert deleted_login.status_code == 403, deleted_login.text
    assert "deleted" in deleted_login.json()["detail"].lower()

    restore_response = client.post(f"/users/{target.id}/restore")
    assert restore_response.status_code == 200, restore_response.text
    restored_payload = restore_response.json()
    assert restored_payload["lifecycle_status"] == "inactive"
    assert restored_payload["can_sign_in"] is False

    inactive_login = client.post(
        "/auth/login",
        json={"email": target.email, "password": "RestorePass123!"},
    )
    assert inactive_login.status_code == 403, inactive_login.text
    assert "inactive" in inactive_login.json()["detail"].lower()

    reactivate_response = client.patch(
        f"/users/{target.id}",
        json={"is_active": True},
    )
    assert reactivate_response.status_code == 200, reactivate_response.text
    assert reactivate_response.json()["lifecycle_status"] == "active"

    active_login = client.post(
        "/auth/login",
        json={"email": target.email, "password": "RestorePass123!"},
    )
    assert active_login.status_code == 200, active_login.text
    assert active_login.json()["access_token"]


def test_list_users_reports_lifecycle_counts(client, authorize, db_session):
    super_admin = User(
        email="super.admin@example.com",
        username="super.admin",
        full_name="Super Admin",
        hashed_password="hash",
        is_active=True,
        is_super_admin=True,
    )
    active_user = User(
        email="active@example.com",
        username="active.user",
        full_name="Active User",
        hashed_password="hash",
        is_active=True,
    )
    inactive_user = User(
        email="inactive@example.com",
        username="inactive.user",
        full_name="Inactive User",
        hashed_password="hash",
        is_active=False,
    )
    suspended_user = User(
        email="suspended@example.com",
        username="suspended.user",
        full_name="Suspended User",
        hashed_password="hash",
        is_active=True,
        suspended_until=datetime.now(timezone.utc) + timedelta(days=2),
        suspension_reason="Coverage gap",
    )
    deleted_user = User(
        email="deleted@example.com",
        username="deleted.user",
        full_name="Deleted User",
        hashed_password="hash",
        is_active=False,
        deleted_at=datetime.now(timezone.utc),
        deletion_reason="No longer needed",
    )
    db_session.add_all([super_admin, active_user, inactive_user, suspended_user, deleted_user])
    db_session.commit()

    authorize(super_admin)
    response = client.get("/users")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["total_active"] == 2
    assert payload["total_inactive"] == 1
    assert payload["total_suspended"] == 1
    assert payload["total_deleted"] == 1
    lifecycle_by_username = {item["username"]: item["lifecycle_status"] for item in payload["items"]}
    assert lifecycle_by_username["suspended.user"] == "suspended"
    assert lifecycle_by_username["deleted.user"] == "deleted"


def test_cannot_delete_own_super_admin_account(client, authorize, db_session):
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
    response = client.request("DELETE", f"/users/{super_admin.id}", json={"reason": "Testing"})

    assert response.status_code == 400, response.text
    assert "own admin access" in response.json()["detail"].lower()
