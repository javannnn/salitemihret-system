from datetime import date


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
