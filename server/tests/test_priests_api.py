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
