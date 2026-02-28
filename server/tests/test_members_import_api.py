from __future__ import annotations


def test_members_import_returns_success_rows(client, authorize, admin_user):
    authorize(admin_user)
    csv_content = (
        "first_name,last_name,phone\n"
        "Abel,Haile,6135550177\n"
    )

    response = client.post(
        "/members/import",
        files={"file": ("members.csv", csv_content.encode("utf-8"), "text/csv")},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["inserted"] == 1
    assert data["updated"] == 0
    assert data["failed"] == 0
    assert data["errors"] == []
    assert len(data["successes"]) == 1
    success = data["successes"][0]
    assert success["row"] == 2
    assert success["action"] == "inserted"
    assert success["member_id"] > 0
    assert success["username"]
    assert success["full_name"] == "Abel Haile"


def test_members_import_returns_mixed_success_and_failures(client, authorize, admin_user):
    authorize(admin_user)
    csv_content = (
        "first_name,last_name,phone\n"
        "Sara,Tesfaye,6135550199\n"
        "Bad,Phone,not-a-phone\n"
    )

    response = client.post(
        "/members/import",
        files={"file": ("members.csv", csv_content.encode("utf-8"), "text/csv")},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["inserted"] == 1
    assert data["updated"] == 0
    assert data["failed"] == 1
    assert len(data["errors"]) == 1
    assert data["errors"][0]["row"] == 3
    assert len(data["successes"]) == 1
    assert data["successes"][0]["row"] == 2


def test_members_import_allows_contribution_above_minimum_without_exception(client, authorize, admin_user):
    authorize(admin_user)
    csv_content = (
        "first_name,last_name,phone,contribution_amount\n"
        "Martha,Haile,6135550123,120\n"
    )

    response = client.post(
        "/members/import",
        files={"file": ("members.csv", csv_content.encode("utf-8"), "text/csv")},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["inserted"] == 1
    assert data["failed"] == 0


def test_members_import_rejects_contribution_below_minimum_without_exception(client, authorize, admin_user):
    authorize(admin_user)
    csv_content = (
        "first_name,last_name,phone,contribution_amount\n"
        "Martha,Haile,6135550123,60\n"
    )

    response = client.post(
        "/members/import",
        files={"file": ("members.csv", csv_content.encode("utf-8"), "text/csv")},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["inserted"] == 0
    assert data["failed"] == 1
    assert "at least 75.00 CAD" in data["errors"][0]["reason"]
