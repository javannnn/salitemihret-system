from __future__ import annotations

from datetime import date

from app.core.config import settings
from app.models.member import Child, Member
from app.models.payment import Payment, PaymentServiceType
from app.models.schools import AbenetEnrollmentPayment

ABENET_SERVICE_CODE = "AbenetSchool"
SUNDAY_SERVICE_CODE = "SCHOOLFEE"


def _create_member(session, first_name: str, last_name: str, birth: date | None = None) -> Member:
    member = Member(
        first_name=first_name,
        last_name=last_name,
        username=f"{first_name.lower()}.{last_name.lower()}",
        status="Active",
        gender="Female",
        birth_date=birth,
    )
    session.add(member)
    session.commit()
    session.refresh(member)
    return member


def _create_child(session, parent: Member, first_name: str, last_name: str, birth: date) -> Child:
    child = Child(
        member_id=parent.id,
        first_name=first_name,
        last_name=last_name,
        full_name=f"{first_name} {last_name}",
        birth_date=birth,
    )
    session.add(child)
    session.commit()
    session.refresh(child)
    return child


def _ensure_service_type(session, code: str, label: str) -> None:
    exists = session.query(PaymentServiceType).filter_by(code=code).first()
    if not exists:
        session.add(PaymentServiceType(code=code, label=label, active=True))
        session.commit()


def test_sunday_school_participant_flow(client, authorize, admin_user, db_session):
    _ensure_service_type(db_session, SUNDAY_SERVICE_CODE, "Sunday School Fee")
    member = _create_member(db_session, "Kidus", "Youth", birth=date(2012, 5, 10))

    authorize(admin_user)
    payload = {
        "member_username": member.username,
        "category": "Child",
        "first_name": "Kidus",
        "last_name": "Youth",
        "gender": "Female",
        "dob": date(2012, 5, 10).isoformat(),
        "membership_date": date.today().isoformat(),
        "phone": "+14165550123",
        "email": "kidus@example.com",
        "pays_contribution": True,
        "monthly_amount": 25,
        "payment_method": "CASH",
    }
    resp = client.post("/sunday-school/participants", json=payload)
    assert resp.status_code == 201, resp.text
    participant = resp.json()
    assert participant["member_username"] == member.username
    assert participant["pays_contribution"] is True

    list_resp = client.get("/sunday-school/participants?page=1&page_size=10")
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1

    pay_resp = client.post(
        f"/sunday-school/participants/{participant['id']}/payments",
        json={"amount": 30, "method": "CASH", "memo": "Monthly dues"},
    )
    assert pay_resp.status_code == 201, pay_resp.text
    updated = pay_resp.json()
    assert updated["last_payment_at"] is not None

    detail_resp = client.get(f"/sunday-school/participants/{participant['id']}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["recent_payments"]
    assert detail["recent_payments"][0]["amount"] == 30

    stats = client.get("/sunday-school/participants/stats").json()
    assert stats["total_participants"] == 1
    assert stats["count_paying_contribution"] == 1

    report = client.get("/reports/sunday-school")
    assert report.status_code == 200
    assert any(row["first_name"] == "Kidus" for row in report.json())


def test_sunday_school_content_workflow(client, authorize, admin_user, db_session):
    _ensure_service_type(db_session, SUNDAY_SERVICE_CODE, "Sunday School Fee")
    member = _create_member(db_session, "Sara", "Public", birth=date(2005, 2, 1))
    authorize(admin_user)
    participant_resp = client.post(
        "/sunday-school/participants",
        json={
            "member_username": member.username,
            "category": "Youth",
            "first_name": "Sara",
            "last_name": "Public",
            "gender": "Female",
            "dob": date(2005, 2, 1).isoformat(),
            "membership_date": date.today().isoformat(),
            "pays_contribution": False,
        },
    )
    assert participant_resp.status_code == 201
    participant_id = participant_resp.json()["id"]

    content_resp = client.post(
        "/sunday-school/content",
        json={"type": "Mezmur", "title": "Hosanna", "body": "Praise and worship text."},
    )
    assert content_resp.status_code == 201
    content_id = content_resp.json()["id"]

    submit_resp = client.post(f"/sunday-school/content/{content_id}/submit")
    assert submit_resp.status_code == 200

    approve_resp = client.post(
        f"/sunday-school/content/{content_id}/approve",
        json={"publish_immediately": True},
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "Approved"
    assert approve_resp.json()["published"] is True

    art_resp = client.post(
        "/sunday-school/content",
        json={
            "type": "Art",
            "title": "Youth Art",
            "file_path": "/uploads/art/1.png",
            "participant_id": participant_id,
        },
    )
    assert art_resp.status_code == 201
    art_id = art_resp.json()["id"]
    client.post(f"/sunday-school/content/{art_id}/submit")
    reject_resp = client.post(
        f"/sunday-school/content/{art_id}/reject",
        json={"reason": "Needs edits"},
    )
    assert reject_resp.status_code == 200
    assert reject_resp.json()["status"] == "Rejected"

    public_list = client.get("/public/sunday-school/mezmur")
    assert public_list.status_code == 200
    assert any(item["title"] == "Hosanna" for item in public_list.json())


def test_sunday_school_category_member_age_validation(client, authorize, admin_user, db_session):
    _ensure_service_type(db_session, SUNDAY_SERVICE_CODE, "Sunday School Fee")
    parent_member = _create_member(db_session, "Marta", "Guardian", birth=date(1989, 3, 2))
    child_member = _create_member(db_session, "Liya", "Teen", birth=date(2014, 8, 20))
    authorize(admin_user)

    valid_child_with_parent_member = client.post(
        "/sunday-school/participants",
        json={
            "member_username": parent_member.username,
            "category": "Child",
            "first_name": "Natan",
            "last_name": "Guardian",
            "gender": "Female",
            "dob": date(2014, 8, 20).isoformat(),
            "membership_date": date.today().isoformat(),
            "pays_contribution": False,
        },
    )
    assert valid_child_with_parent_member.status_code == 201, valid_child_with_parent_member.text

    invalid_child_age = client.post(
        "/sunday-school/participants",
        json={
            "member_username": parent_member.username,
            "category": "Child",
            "first_name": "Marta",
            "last_name": "Guardian",
            "gender": "Female",
            "dob": date(1989, 3, 2).isoformat(),
            "membership_date": date.today().isoformat(),
            "pays_contribution": False,
        },
    )
    assert invalid_child_age.status_code == 400
    assert "under 18" in invalid_child_age.text

    adult_category_with_child = client.post(
        "/sunday-school/participants",
        json={
            "member_username": child_member.username,
            "category": "Adult",
            "first_name": "Liya",
            "last_name": "Minor",
            "gender": "Female",
            "dob": date(2014, 8, 20).isoformat(),
            "membership_date": date.today().isoformat(),
            "pays_contribution": False,
        },
    )
    assert adult_category_with_child.status_code == 400
    assert "18 or older" in adult_category_with_child.text

    youth_category_with_child = client.post(
        "/sunday-school/participants",
        json={
            "member_username": child_member.username,
            "category": "Youth",
            "first_name": "Liya",
            "last_name": "Teen",
            "gender": "Female",
            "dob": date(2014, 8, 20).isoformat(),
            "membership_date": date.today().isoformat(),
            "pays_contribution": False,
        },
    )
    assert youth_category_with_child.status_code == 400
    assert "18 or older" in youth_category_with_child.text


def test_member_children_search_returns_parent_contact(client, authorize, admin_user, db_session):
    parent = _create_member(db_session, "Hanna", "Parent", birth=date(1988, 1, 12))
    parent.email = "hanna.parent@example.com"
    parent.phone = "+14165550111"
    db_session.add(parent)
    db_session.commit()
    _create_child(db_session, parent, "Lidya", "Hanna", birth=date(2016, 6, 5))

    authorize(admin_user)
    resp = client.get("/members/children-search?q=Lidya&limit=5")
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["items"]
    item = payload["items"][0]
    assert item["parent_member_id"] == parent.id
    assert item["parent_username"] == parent.username
    assert item["parent_email"] == "hanna.parent@example.com"


def test_create_abenet_enrollment_and_record_payment(client, authorize, admin_user, db_session):
    _ensure_service_type(db_session, ABENET_SERVICE_CODE, "Abenet School Tuition")
    parent = _create_member(db_session, "Abel", "Parent", birth=date(1985, 3, 3))
    child = _create_child(db_session, parent, "Lulit", "Abel", birth=date(2016, 7, 12))

    authorize(admin_user)
    payload = {
        "parent_member_id": parent.id,
        "child_id": child.id,
        "birth_date": child.birth_date.isoformat(),
        "service_stage": "Alphabet",
        "enrollment_date": date.today().isoformat(),
    }
    resp = client.post("/schools/abenet", json=payload)
    assert resp.status_code == 201, resp.text
    detail = resp.json()
    assert detail["parent"]["id"] == parent.id
    assert detail["child"]["id"] == child.id
    assert detail["monthly_amount"] == float(settings.ABENET_MONTHLY_AMOUNT)

    meta = client.get("/schools/meta")
    assert meta.status_code == 200
    assert float(meta.json()["monthly_amount"]) == float(settings.ABENET_MONTHLY_AMOUNT)

    pending_link = db_session.query(AbenetEnrollmentPayment).filter_by(enrollment_id=detail["id"]).first()
    assert pending_link is not None
    pending_payment = db_session.get(Payment, pending_link.payment_id)
    assert pending_payment.status == "Pending"

    list_resp = client.get("/schools/abenet?page=1&page_size=5&q=Lulit")
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1

    pay_resp = client.post(
        f"/schools/abenet/{detail['id']}/payments",
        json={"method": "Cash", "memo": "Initial tuition"},
    )
    assert pay_resp.status_code == 201, pay_resp.text
    payment_row = db_session.get(Payment, pending_link.payment_id)
    assert payment_row.status == "Completed"
    assert payment_row.method == "Cash"

    report = client.get("/schools/abenet/report")
    assert report.status_code == 200
    assert any(row["child_name"].startswith("Lulit") for row in report.json())
