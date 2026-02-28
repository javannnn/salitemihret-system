from datetime import date

from app.models.volunteer_group import VolunteerGroup
from app.models.volunteer_worker import VolunteerWorker


def test_create_volunteer_worker_normalizes_canadian_phone(client, authorize, office_admin_user):
    authorize(office_admin_user)

    group_resp = client.post("/volunteers/groups", json={"name": "Hospitality"})
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    payload = {
        "group_id": group_id,
        "first_name": "Marta",
        "last_name": "Kebede",
        "phone": "(613) 555-0199",
        "service_type": "GeneralService",
        "service_date": date.today().isoformat(),
        "reason": "Front desk support",
    }

    response = client.post("/volunteers/workers", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["phone"] == "+16135550199"
    assert body["phone_valid"] is True


def test_create_volunteer_worker_rejects_non_canadian_phone(client, authorize, office_admin_user):
    authorize(office_admin_user)

    group_resp = client.post("/volunteers/groups", json={"name": "Security"})
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    payload = {
        "group_id": group_id,
        "first_name": "Rahel",
        "last_name": "Abebe",
        "phone": "+251900123456",
        "service_type": "Holiday",
        "service_date": date.today().isoformat(),
    }

    response = client.post("/volunteers/workers", json=payload)

    assert response.status_code == 422
    assert "Canadian" in response.text


def test_update_volunteer_worker_rejects_non_canadian_phone(client, authorize, office_admin_user):
    authorize(office_admin_user)

    group_resp = client.post("/volunteers/groups", json={"name": "Choir"})
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    create_resp = client.post(
        "/volunteers/workers",
        json={
            "group_id": group_id,
            "first_name": "Yared",
            "last_name": "Mekonnen",
            "phone": "+16135550199",
            "service_type": "GeneralService",
            "service_date": date.today().isoformat(),
        },
    )
    assert create_resp.status_code == 201
    worker_id = create_resp.json()["id"]

    response = client.patch(f"/volunteers/workers/{worker_id}", json={"phone": "0911123456"})

    assert response.status_code == 422
    assert "Canadian" in response.text


def test_list_volunteer_workers_tolerates_invalid_existing_phone(client, authorize, office_admin_user, db_session):
    authorize(office_admin_user)

    group = VolunteerGroup(name="Legacy Team")
    db_session.add(group)
    db_session.commit()
    db_session.refresh(group)

    worker = VolunteerWorker(
        group_id=group.id,
        first_name="Legacy",
        last_name="Volunteer",
        phone="+251900123456",
        service_type="GeneralService",
        service_date=date.today(),
        reason="Imported before validation",
    )
    db_session.add(worker)
    db_session.commit()
    db_session.refresh(worker)

    response = client.get("/volunteers/workers?page=1&page_size=10")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["phone"] == "+251900123456"
    assert body["items"][0]["phone_valid"] is False
