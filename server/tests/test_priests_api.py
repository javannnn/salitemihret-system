from __future__ import annotations


def test_priest_update_archive_restore_flow(client, authorize, public_relations_user):
    authorize(public_relations_user)
    create_resp = client.post(
        "/priests",
        json={"full_name": "Abba Tesfa", "phone": "+14165550100", "email": "abba@example.com"},
    )
    assert create_resp.status_code == 201, create_resp.text
    priest_id = create_resp.json()["id"]

    detail_resp = client.get(f"/priests/{priest_id}")
    assert detail_resp.status_code == 200
    assert detail_resp.json()["full_name"] == "Abba Tesfa"

    update_resp = client.patch(
        f"/priests/{priest_id}",
        json={"phone": "+14165550101", "status": "OnLeave"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "OnLeave"
    assert update_resp.json()["phone"] == "+14165550101"

    archive_resp = client.post(f"/priests/{priest_id}/archive")
    assert archive_resp.status_code == 200
    assert archive_resp.json()["status"] == "Inactive"

    restore_resp = client.post(f"/priests/{priest_id}/restore")
    assert restore_resp.status_code == 200
    assert restore_resp.json()["status"] == "Active"

    delete_resp = client.delete(f"/priests/{priest_id}")
    assert delete_resp.status_code == 200, delete_resp.text


def test_priest_management_requires_father_confessor_permission(client, authorize, registrar_user, admin_user):
    authorize(admin_user)
    create_resp = client.post(
        "/priests",
        json={"full_name": "Abba Permission Check"},
    )
    assert create_resp.status_code == 201, create_resp.text
    priest_id = create_resp.json()["id"]

    authorize(registrar_user)

    create_denied = client.post(
        "/priests",
        json={"full_name": "Abba Registrar"},
    )
    assert create_denied.status_code == 403

    update_denied = client.patch(
        f"/priests/{priest_id}",
        json={"status": "Inactive"},
    )
    assert update_denied.status_code == 403

    archive_denied = client.post(f"/priests/{priest_id}/archive")
    assert archive_denied.status_code == 403

    delete_denied = client.delete(f"/priests/{priest_id}")
    assert delete_denied.status_code == 403


def test_priest_delete_rejects_assigned_members(client, authorize, admin_user, sample_member, db_session):
    authorize(admin_user)
    create_resp = client.post(
        "/priests",
        json={"full_name": "Abba Linked"},
    )
    assert create_resp.status_code == 201, create_resp.text
    priest_id = create_resp.json()["id"]

    sample_member.father_confessor_id = priest_id
    sample_member.has_father_confessor = True
    db_session.add(sample_member)
    db_session.commit()

    delete_resp = client.delete(f"/priests/{priest_id}")
    assert delete_resp.status_code == 409
    assert "Remove or reassign" in delete_resp.text
