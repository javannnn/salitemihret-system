from __future__ import annotations

from datetime import date

from app.models.member import Member
from app.models.ministry import Ministry
from app.models.tag import Tag

def test_list_members_requires_auth(client):
    response = client.get("/members")
    assert response.status_code == 401


def test_list_members_as_office_admin(client, authorize, office_admin_user, sample_member):
    authorize(office_admin_user)
    response = client.get("/members")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["username"] == sample_member.username


def test_create_member_requires_registrar_or_admin(client, authorize, office_admin_user):
    authorize(office_admin_user)
    payload = {
        "first_name": "Lulit",
        "last_name": "Bekele",
        "status": "Active",
    }
    response = client.post("/members", json=payload)
    assert response.status_code == 403


def test_create_member_success(client, authorize, registrar_user, db_session):
    authorize(registrar_user)
    tag = Tag(name="Choir", slug="choir")
    ministry = Ministry(name="Sunday School", slug="sundayschool")
    db_session.add_all([tag, ministry])
    db_session.commit()
    payload = {
        "first_name": "Lulit",
        "last_name": "Bekele",
        "status": "Active",
        "is_tither": True,
        "contribution_method": "Bank",
        "contribution_amount": 120.5,
        "spouse": {"full_name": "Hailu Bekele"},
        "children": [
            {"full_name": "Dawit Bekele", "birth_date": "2010-05-12"},
            {"full_name": "Sara Bekele"},
        ],
        "tag_ids": [tag.id],
        "ministry_ids": [ministry.id],
    }
    response = client.post("/members", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["username"] == "lulit.bekele"
    assert len(data["children"]) == 2
    assert len(data["tags"]) == 1
    assert data["tags"][0]["slug"] == "choir"
    assert len(data["ministries"]) == 1

    member = db_session.query(Member).filter_by(username="lulit.bekele").first()
    assert member is not None
    assert member.is_tither is True
    assert [tag.slug for tag in member.tags] == ["choir"]


def test_create_member_future_birth_date(client, authorize, registrar_user):
    authorize(registrar_user)
    payload = {
        "first_name": "Future",
        "last_name": "Person",
        "birth_date": date.today().replace(year=date.today().year + 1).isoformat(),
        "status": "Active",
    }
    response = client.post("/members", json=payload)
    assert response.status_code == 422


def test_update_member_regenerates_username(client, authorize, registrar_user, sample_member, db_session):
    authorize(registrar_user)
    response = client.put(
        f"/members/{sample_member.id}",
        json={"first_name": "Selam", "last_name": "Kebede"},
    )
    assert response.status_code == 200, response.text
    member = db_session.get(Member, sample_member.id)
    assert member.username.startswith("selam.kebede")


def test_patch_member_updates_status(client, authorize, registrar_user, sample_member, db_session):
    authorize(registrar_user)
    response = client.patch(
        f"/members/{sample_member.id}",
        json={"status": "Inactive"},
    )
    assert response.status_code == 200
    member = db_session.get(Member, sample_member.id)
    assert member.status == "Inactive"


def test_delete_member_soft_delete(client, authorize, admin_user, sample_member, db_session):
    authorize(admin_user)
    response = client.delete(f"/members/{sample_member.id}")
    assert response.status_code == 204

    member = db_session.get(Member, sample_member.id)
    assert member.deleted_at is not None
    assert member.status == "Archived"

    authorize(admin_user)
    response = client.get("/members")
    assert response.status_code == 200
    result = response.json()
    assert result["total"] == 0
    assert result["items"] == []


def test_restore_member(client, authorize, admin_user, sample_member, db_session):
    authorize(admin_user)
    response = client.delete(f"/members/{sample_member.id}")
    assert response.status_code == 204

    response = client.post(f"/members/{sample_member.id}/restore")
    assert response.status_code == 200
    restored = db_session.get(Member, sample_member.id)
    assert restored.deleted_at is None
    assert restored.status == "Inactive"


def test_list_filter_by_gender_and_tag(client, authorize, office_admin_user, db_session, sample_member):
    authorize(office_admin_user)
    second = Member(
        first_name="Kebede",
        last_name="Alemu",
        username="kebede.alemu",
        status="Active",
        gender="Male",
    )
    choir = Tag(name="Choir Tag", slug="choir-tag")
    db_session.add_all([second, choir])
    db_session.commit()

    sample_member.gender = "Female"
    sample_member.tags.append(choir)
    db_session.commit()

    response = client.get("/members?gender=Female&tag=choir-tag")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["username"] == sample_member.username


def test_list_includes_archived_when_requested(client, authorize, admin_user, sample_member, db_session):
    authorize(admin_user)
    client.delete(f"/members/{sample_member.id}")
    response = client.get("/members?status=Archived")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "Archived"
