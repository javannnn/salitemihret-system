from __future__ import annotations

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
