from __future__ import annotations

from datetime import date, datetime, timedelta

from app.models.household import Household
from app.models.member import Member
from app.models.newcomer import Newcomer
from app.models.payment import Payment, PaymentServiceType
from app.models.sponsorship import Sponsorship
from app.models.ministry import Ministry
from app.models.tag import Tag
from app.models.user import UserInvitation, UserMemberLink

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
        "email": "lulit.bekele@example.com",
        "phone": "6135550188",
        "pays_contribution": True,
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
        "email": "lulit@example.com",
        "status": "Active",
        "is_tither": True,
        "phone": "6135550177",
        "address_postal_code": "T5J 0N3",
        "pays_contribution": True,
        "contribution_method": "E-Transfer",
        "contribution_amount": 75.0,
        "spouse": {"first_name": "Hailu", "last_name": "Bekele"},
        "children": [
            {"first_name": "Dawit", "last_name": "Bekele", "birth_date": "2010-05-12"},
            {"first_name": "Sara", "last_name": "Bekele"},
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


def test_create_member_requires_email(client, authorize, registrar_user):
    authorize(registrar_user)
    payload = {
        "first_name": "No",
        "last_name": "Email",
        "phone": "6135550191",
        "pays_contribution": True,
    }
    response = client.post("/members", json=payload)
    assert response.status_code == 422
    assert "email" in response.text.lower()


def test_create_member_future_birth_date(client, authorize, registrar_user):
    authorize(registrar_user)
    payload = {
        "first_name": "Future",
        "last_name": "Person",
        "email": "future.person@example.com",
        "birth_date": date.today().replace(year=date.today().year + 1).isoformat(),
        "status": "Active",
        "phone": "6135550166",
        "address_postal_code": "T5J 0N3",
        "pays_contribution": True,
    }
    response = client.post("/members", json=payload)
    assert response.status_code == 422


def test_create_member_rejects_future_child_birth_date(client, authorize, registrar_user):
    authorize(registrar_user)
    payload = {
        "first_name": "Parent",
        "last_name": "Member",
        "email": "parent.member@example.com",
        "status": "Active",
        "phone": "6135550123",
        "address_postal_code": "T5J 0N3",
        "pays_contribution": True,
        "children": [
            {
                "first_name": "Future",
                "last_name": "Child",
                "birth_date": (date.today() + timedelta(days=1)).isoformat(),
            }
        ],
    }
    response = client.post("/members", json=payload)
    assert response.status_code == 422


def test_create_member_allows_contribution_above_minimum_without_exception(client, authorize, registrar_user):
    authorize(registrar_user)
    payload = {
        "first_name": "Meron",
        "last_name": "Asfaw",
        "email": "meron.asfaw@example.com",
        "status": "Active",
        "phone": "6135550155",
        "address_postal_code": "T5J 0N3",
        "pays_contribution": True,
        "contribution_amount": 120.0,
    }
    response = client.post("/members", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["contribution_amount"] == 120.0
    assert data["contribution_exception_reason"] is None


def test_create_member_rejects_contribution_below_minimum_without_exception(client, authorize, registrar_user):
    authorize(registrar_user)
    payload = {
        "first_name": "Liya",
        "last_name": "Bekele",
        "email": "liya.bekele@example.com",
        "status": "Active",
        "phone": "6135550144",
        "address_postal_code": "T5J 0N3",
        "pays_contribution": True,
        "contribution_amount": 50.0,
    }
    response = client.post("/members", json=payload)
    assert response.status_code == 400
    assert "at least 75.00 CAD" in response.text


def test_update_member_preserves_existing_username(client, authorize, registrar_user, sample_member, db_session):
    authorize(registrar_user)
    original_username = sample_member.username
    response = client.put(
        f"/members/{sample_member.id}",
        json={"first_name": "Selam", "last_name": "Kebede"},
    )
    assert response.status_code == 200, response.text
    db_session.expire_all()
    member = db_session.get(Member, sample_member.id)
    assert member.username == original_username


def test_patch_member_updates_status(client, authorize, admin_user, sample_member, db_session):
    authorize(admin_user)
    response = client.patch(
        f"/members/{sample_member.id}",
        json={"status": "Inactive"},
    )
    assert response.status_code == 200
    db_session.expire_all()
    member = db_session.get(Member, sample_member.id)
    assert member.status == "Inactive"


def test_patch_member_rejects_blank_email(client, authorize, admin_user, sample_member):
    authorize(admin_user)
    response = client.patch(
        f"/members/{sample_member.id}",
        json={"email": None},
    )
    assert response.status_code == 422
    assert "email is required" in response.text.lower()


def test_patch_member_rejects_future_child_birth_date(client, authorize, admin_user, sample_member):
    authorize(admin_user)
    response = client.patch(
        f"/members/{sample_member.id}",
        json={
            "children": [
                {
                    "first_name": "Future",
                    "last_name": "Child",
                    "birth_date": (date.today() + timedelta(days=1)).isoformat(),
                }
            ]
        },
    )
    assert response.status_code == 422


def test_delete_member_soft_delete(client, authorize, admin_user, sample_member, db_session):
    authorize(admin_user)
    response = client.delete(f"/members/{sample_member.id}")
    assert response.status_code == 204

    db_session.expire_all()
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
    db_session.expire_all()
    restored = db_session.get(Member, sample_member.id)
    assert restored.deleted_at is None
    assert restored.status == "Pending"


def test_get_member_permanent_delete_impact_lists_warning_dependencies(
    client,
    authorize,
    admin_user,
    sample_member,
    db_session,
):
    sample_member.deleted_at = datetime.utcnow()
    sample_member.status = "Archived"
    household = Household(name="Archive Household", head_member_id=sample_member.id)
    service_type = PaymentServiceType(code="donation", label="Donation")
    sponsor = Member(
        first_name="Beneficiary",
        last_name="Sponsor",
        username="beneficiary.sponsor",
        email="beneficiary.sponsor@example.com",
        status="Active",
        phone="+16135550188",
        pays_contribution=True,
    )
    db_session.add_all([household, service_type, sponsor])
    db_session.commit()
    db_session.add_all(
        [
            Payment(amount=25, currency="CAD", service_type=service_type, member_id=sample_member.id, status="Completed"),
            Sponsorship(
                sponsor_member_id=sponsor.id,
                beneficiary_member_id=sample_member.id,
                beneficiary_name="Beneficiary",
                start_date=date(2025, 1, 1),
                monthly_amount=50,
                status="Active",
            ),
            Newcomer(
                newcomer_code="NC-001",
                first_name="Selam",
                last_name="Guest",
                arrival_date=date(2025, 1, 1),
                status="New",
                sponsored_by_member_id=sample_member.id,
            ),
            UserMemberLink(user_id=admin_user.id, member_id=sample_member.id, status="linked"),
            UserInvitation(
                email="pending@example.com",
                username="pending.user",
                token_hash="pending-token",
                expires_at=datetime.utcnow() + timedelta(days=2),
                member_id=sample_member.id,
            ),
        ]
    )
    db_session.commit()

    authorize(admin_user)
    response = client.get(f"/members/{sample_member.id}/permanent-delete-impact")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["can_delete"] is True
    warning_labels = {item["label"] for item in data["warnings"]}
    assert "Payments ledger links" in warning_labels
    assert "Sponsorship beneficiaries" in warning_labels
    assert "Newcomer sponsor references" in warning_labels
    assert "Household head assignments" in warning_labels
    assert "User-member links" in warning_labels
    assert "Pending user invitations" in warning_labels


def test_permanent_delete_archived_member_blocks_when_critical_records_exist(
    client,
    authorize,
    admin_user,
    sample_member,
    db_session,
):
    sample_member.deleted_at = datetime.utcnow()
    sample_member.status = "Archived"
    sponsor = Member(
        first_name="Sponsor",
        last_name="Member",
        username="sponsor.member",
        email="sponsor.member@example.com",
        status="Active",
        phone="+16135550199",
        pays_contribution=True,
    )
    db_session.add(sponsor)
    db_session.commit()
    db_session.add(
        Sponsorship(
            sponsor_member_id=sample_member.id,
            beneficiary_name="Blocked Beneficiary",
            start_date=date(2025, 1, 1),
            monthly_amount=75,
            status="Active",
        )
    )
    db_session.commit()

    authorize(admin_user)
    impact_response = client.get(f"/members/{sample_member.id}/permanent-delete-impact")
    assert impact_response.status_code == 200
    impact = impact_response.json()
    assert impact["can_delete"] is False
    assert {item["label"] for item in impact["blockers"]} == {"Sponsorships"}

    delete_response = client.delete(f"/members/{sample_member.id}/permanent")
    assert delete_response.status_code == 409
    assert "Permanent deletion is blocked" in delete_response.text
    assert db_session.get(Member, sample_member.id) is not None


def test_permanent_delete_archived_member_unlinks_safe_dependencies(
    client,
    authorize,
    admin_user,
    sample_member,
    db_session,
):
    sample_member.deleted_at = datetime.utcnow()
    sample_member.status = "Archived"
    service_type = PaymentServiceType(code="community", label="Community Support")
    other_member = Member(
        first_name="Other",
        last_name="Sponsor",
        username="other.sponsor",
        email="other.sponsor@example.com",
        status="Active",
        phone="+16135550222",
        pays_contribution=True,
    )
    household = Household(name="Archive Household Two", head_member_id=sample_member.id)
    payment = Payment(amount=10, currency="CAD", service_type=service_type, member_id=sample_member.id, status="Completed")
    sponsorship = Sponsorship(
        sponsor_member_id=other_member.id,
        beneficiary_member_id=sample_member.id,
        beneficiary_name="Archived Beneficiary",
        start_date=date(2025, 2, 1),
        monthly_amount=25,
        status="Active",
    )
    newcomer = Newcomer(
        newcomer_code="NC-DELETE",
        first_name="Delete",
        last_name="Preview",
        arrival_date=date(2025, 2, 1),
        status="New",
        sponsored_by_member_id=sample_member.id,
        converted_member_id=sample_member.id,
    )
    member_link = UserMemberLink(user_id=admin_user.id, member_id=sample_member.id, status="linked")
    invitation = UserInvitation(
        email="delete@example.com",
        username="delete.invite",
        token_hash="delete-token",
        expires_at=datetime.utcnow() + timedelta(days=3),
        member_id=sample_member.id,
    )
    db_session.add_all([service_type, other_member])
    db_session.commit()
    sponsorship.sponsor_member_id = other_member.id
    db_session.add_all([household, payment, sponsorship, newcomer, member_link, invitation])
    db_session.commit()

    authorize(admin_user)
    response = client.delete(f"/members/{sample_member.id}/permanent")
    assert response.status_code == 204, response.text

    db_session.expire_all()
    assert db_session.get(Member, sample_member.id) is None
    assert db_session.get(Payment, payment.id).member_id is None
    assert db_session.get(Sponsorship, sponsorship.id).beneficiary_member_id is None
    refreshed_newcomer = db_session.get(Newcomer, newcomer.id)
    assert refreshed_newcomer.sponsored_by_member_id is None
    assert refreshed_newcomer.converted_member_id is None
    assert db_session.get(Household, household.id).head_member_id is None
    assert db_session.get(UserMemberLink, member_link.id).member_id is None
    assert db_session.get(UserInvitation, invitation.id).member_id is None


def test_list_filter_by_gender_and_tag(client, authorize, office_admin_user, db_session, sample_member):
    authorize(office_admin_user)
    second = Member(
        first_name="Kebede",
        last_name="Alemu",
        username="kebede.alemu",
        email="kebede.alemu@example.com",
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


def test_list_members_matches_full_name_search(client, authorize, office_admin_user, sample_member):
    authorize(office_admin_user)
    response = client.get("/members?q=Abeba Tesfaye")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == sample_member.id


def test_list_members_matches_last_name_first_search(client, authorize, office_admin_user, sample_member):
    authorize(office_admin_user)
    response = client.get("/members?q=Tesfaye Abeba")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == sample_member.id


def test_list_includes_archived_when_requested(client, authorize, admin_user, sample_member, db_session):
    authorize(admin_user)
    client.delete(f"/members/{sample_member.id}")
    response = client.get("/members?status=Archived")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "Archived"


def test_list_members_allows_mock_placeholder_email(client, authorize, office_admin_user, sample_member, db_session):
    sample_member.email = "mock+member-999@example.invalid"
    db_session.add(sample_member)
    db_session.commit()

    authorize(office_admin_user)
    response = client.get("/members?sort=-updated_at")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total"] >= 1
    assert data["items"][0]["email"] == "mock+member-999@example.invalid"


def test_member_spouse_patch_flow(client, authorize, registrar_user, sample_member, db_session):
    authorize(registrar_user)
    payload = {
        "marital_status": "Married",
        "spouse": {"first_name": "Saba", "last_name": "Kidane", "phone": "+16475550123"},
    }
    response = client.patch(f"/members/{sample_member.id}/spouse", json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["full_name"] == "Saba Kidane"

    db_session.expire_all()
    member = db_session.get(Member, sample_member.id)
    assert member.spouse is not None
    assert member.marital_status == "Married"

    clear_resp = client.patch(
        f"/members/{sample_member.id}/spouse",
        json={"marital_status": "Single", "spouse": None},
    )
    assert clear_resp.status_code == 200
    assert clear_resp.json() is None
    db_session.expire_all()
    member = db_session.get(Member, sample_member.id)
    assert member.spouse is None
    assert member.marital_status == "Single"
