from datetime import date, timedelta
import pytest
from app.models.member import Member

def test_create_member_under_18_fails(client, authorize, registrar_user):
    authorize(registrar_user)
    today = date.today()
    birth_date = today.replace(year=today.year - 17)
    payload = {
        "first_name": "Young",
        "last_name": "Member",
        "birth_date": birth_date.isoformat(),
        "status": "Active",
        "phone": "6135550199",
    }
    response = client.post("/members", json=payload)
    assert response.status_code == 400
    assert "Members must be 18 years or older" in response.json()["detail"]

def test_create_member_with_child_over_18_fails(client, authorize, registrar_user):
    authorize(registrar_user)
    today = date.today()
    child_birth_date = today.replace(year=today.year - 19)
    payload = {
        "first_name": "Parent",
        "last_name": "Member",
        "birth_date": today.replace(year=today.year - 40).isoformat(),
        "status": "Active",
        "phone": "6135550198",
        "children": [
            {"first_name": "Adult", "last_name": "Child", "birth_date": child_birth_date.isoformat()}
        ]
    }
    response = client.post("/members", json=payload)
    assert response.status_code == 400
    assert "is over 18" in response.json()["detail"]

def test_update_member_under_18_fails(client, authorize, registrar_user, sample_member):
    authorize(registrar_user)
    today = date.today()
    birth_date = today.replace(year=today.year - 17)
    payload = {
        "birth_date": birth_date.isoformat(),
    }
    response = client.patch(f"/members/{sample_member.id}", json=payload)
    assert response.status_code == 400
    assert "Members must be 18 years or older" in response.json()["detail"]

def test_update_member_with_child_over_18_fails(client, authorize, registrar_user, sample_member):
    authorize(registrar_user)
    today = date.today()
    child_birth_date = today.replace(year=today.year - 19)
    payload = {
        "children": [
            {"first_name": "Adult", "last_name": "Child", "birth_date": child_birth_date.isoformat()}
        ]
    }
    response = client.patch(f"/members/{sample_member.id}", json=payload)
    assert response.status_code == 400
    assert "is over 18" in response.json()["detail"]
