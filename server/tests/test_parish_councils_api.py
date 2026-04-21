from __future__ import annotations

from datetime import date

from app.models.member import Member
from app.routers import parish_councils as parish_councils_router


def _create_member(db_session, *, first_name: str, last_name: str, birth_date: date | None) -> Member:
    member = Member(
        first_name=first_name,
        middle_name="T.",
        last_name=last_name,
        username=f"{first_name.lower()}.{last_name.lower()}.{birth_date.isoformat() if birth_date else 'na'}".replace("-", ""),
        email=f"{first_name.lower()}.{last_name.lower()}@example.com",
        status="Active",
        gender="Female",
        district="Arada",
        join_date=date(2024, 1, 1),
        phone="+16135550100",
        birth_date=birth_date,
        pays_contribution=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    return member


def _department_id_by_name(client, name: str) -> int:
    response = client.get("/parish-councils/meta")
    assert response.status_code == 200
    payload = response.json()
    return next(item["id"] for item in payload["departments"] if item["name"] == name)


def test_office_admin_can_view_but_not_edit_parish_councils(client, authorize, office_admin_user):
    authorize(office_admin_user)

    list_response = client.get("/parish-councils/departments")
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 6

    department_id = _department_id_by_name(client, "Finance Department")
    update_response = client.patch(
        f"/parish-councils/departments/{department_id}",
        json={"notes": "restricted"},
    )
    assert update_response.status_code == 403


def test_parish_council_admin_can_create_assignment_and_report(client, authorize, parish_council_admin_user, db_session):
    authorize(parish_council_admin_user)
    member = _create_member(
        db_session,
        first_name="Martha",
        last_name="Kiros",
        birth_date=date(2005, 4, 1),
    )
    department_id = _department_id_by_name(client, "Finance Department")

    create_response = client.post(
        "/parish-councils/assignments",
        json={
            "department_id": department_id,
            "trainee_member_id": member.id,
            "training_from": "2026-04-21",
            "training_to": "2026-08-21",
            "status": "Active",
        },
    )

    assert create_response.status_code == 201
    payload = create_response.json()
    assert payload["department_name"] == "Finance Department"
    assert payload["trainee_first_name"] == "Martha"
    assert payload["status"] == "Active"
    assert payload["approval_status"] == "Pending"

    report_response = client.get("/reports/parish-councils")
    assert report_response.status_code == 200
    report = report_response.json()
    assert report["summary"]["total_rows"] >= 1
    assert any(row["trainee_first_name"] == "Martha" for row in report["rows"])


def test_underage_trainee_is_rejected_for_restricted_department(client, authorize, parish_council_admin_user, db_session):
    authorize(parish_council_admin_user)
    member = _create_member(
        db_session,
        first_name="Liya",
        last_name="Berhe",
        birth_date=date(2015, 7, 1),
    )
    department_id = _department_id_by_name(client, "Finance Department")

    response = client.post(
        "/parish-councils/assignments",
        json={
            "department_id": department_id,
            "trainee_member_id": member.id,
            "training_from": "2026-04-21",
            "training_to": "2026-06-21",
            "status": "Active",
        },
    )

    assert response.status_code == 400
    assert "at least 13 years old" in response.json()["detail"]


def test_gospel_department_allows_underage_exception(client, authorize, parish_council_admin_user, db_session):
    authorize(parish_council_admin_user)
    member = _create_member(
        db_session,
        first_name="Kidist",
        last_name="Welde",
        birth_date=date(2015, 7, 1),
    )
    department_id = _department_id_by_name(client, "Gospel Department")

    response = client.post(
        "/parish-councils/assignments",
        json={
            "department_id": department_id,
            "trainee_member_id": member.id,
            "training_from": "2026-04-21",
            "training_to": "2026-06-21",
            "status": "Active",
        },
    )

    assert response.status_code == 201
    assert response.json()["department_name"] == "Gospel Department"


def test_parish_council_member_search_supports_member_linking(client, authorize, parish_council_admin_user, sample_member):
    authorize(parish_council_admin_user)

    response = client.get("/parish-councils/member-search", params={"query": sample_member.first_name})

    assert response.status_code == 200
    payload = response.json()
    assert any(item["id"] == sample_member.id for item in payload)


def test_parish_council_document_upload_and_approval_flow(
    client,
    authorize,
    parish_council_admin_user,
    db_session,
    tmp_path,
    monkeypatch,
):
    authorize(parish_council_admin_user)
    monkeypatch.setattr(parish_councils_router, "PARISH_COUNCIL_DOCUMENT_UPLOAD_DIR", tmp_path)
    tmp_path.mkdir(parents=True, exist_ok=True)

    member = _create_member(
        db_session,
        first_name="Selam",
        last_name="Haile",
        birth_date=date(2006, 5, 7),
    )
    department_id = _department_id_by_name(client, "Finance Department")
    create_response = client.post(
        "/parish-councils/assignments",
        json={
            "department_id": department_id,
            "trainee_member_id": member.id,
            "training_from": "2026-04-21",
            "training_to": "2026-08-21",
            "status": "Active",
            "notes": "Needs review",
        },
    )

    assert create_response.status_code == 201
    assignment_id = create_response.json()["id"]
    assert create_response.json()["approval_status"] == "Pending"

    upload_response = client.post(
        f"/parish-councils/departments/{department_id}/documents",
        data={
            "document_type": "ApprovalForm",
            "title": "Finance trainee approval",
            "assignment_id": str(assignment_id),
            "notes": "Signed by reviewer",
        },
        files={"file": ("approval.pdf", b"%PDF-1.4 test file", "application/pdf")},
    )
    assert upload_response.status_code == 201
    document_payload = upload_response.json()
    assert document_payload["document_type"] == "ApprovalForm"
    assert document_payload["assignment_id"] == assignment_id
    assert document_payload["original_filename"] == "approval.pdf"
    assert document_payload["file_url"] == f"/parish-councils/documents/{document_payload['id']}/file"
    assert len(list(tmp_path.iterdir())) == 1

    file_response = client.get(document_payload["file_url"])
    assert file_response.status_code == 200
    assert file_response.headers["content-type"] == "application/pdf"
    assert file_response.content == b"%PDF-1.4 test file"

    approve_response = client.post(
        f"/parish-councils/assignments/{assignment_id}/approval",
        json={"action": "approve", "note": "Ready for live use"},
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["approval_status"] == "Approved"
    assert approve_response.json()["approval_note"] == "Ready for live use"

    detail_response = client.get(f"/parish-councils/departments/{department_id}")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["document_count"] == 1
    assert len(detail["documents"]) == 1
    assert any(item["action"] == "document_uploaded" for item in detail["activity"])
    assert any(item["action"] == "approval_approve" for item in detail["activity"])

    delete_response = client.delete(f"/parish-councils/documents/{document_payload['id']}")
    assert delete_response.status_code == 204
    assert len(list(tmp_path.iterdir())) == 0
