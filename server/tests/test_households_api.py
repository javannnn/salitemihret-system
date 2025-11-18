from __future__ import annotations

from app.models.member import Member


def _create_member(session, first_name: str, last_name: str) -> Member:
    member = Member(
        first_name=first_name,
        last_name=last_name,
        username=f"{first_name.lower()}.{last_name.lower()}",
        status="Active",
        phone="+14165550000",
    )
    session.add(member)
    session.commit()
    session.refresh(member)
    return member


def test_create_and_assign_household(client, authorize, registrar_user, db_session):
    first = _create_member(db_session, "Selam", "Member")
    second = _create_member(db_session, "Kidus", "Sibling")

    authorize(registrar_user)
    create_resp = client.post("/households", json={"name": "Selam Family"})
    assert create_resp.status_code == 201, create_resp.text
    household_id = create_resp.json()["id"]

    assign_resp = client.post(
        f"/households/{household_id}/members",
        json={"member_ids": [first.id, second.id], "head_member_id": second.id},
    )
    assert assign_resp.status_code == 200, assign_resp.text
    detail = assign_resp.json()
    assert detail["members_count"] == 2
    assert detail["head_member_id"] == second.id
    assert sorted(member["id"] for member in detail["members"]) == [first.id, second.id]

    db_session.refresh(first)
    db_session.refresh(second)
    assert first.household_id == household_id
    assert second.household_id == household_id


def test_list_households_includes_counts(client, authorize, registrar_user, db_session):
    member = _create_member(db_session, "Hanna", "Leader")
    authorize(registrar_user)
    create_resp = client.post("/households", json={"name": "Hanna Household", "head_member_id": member.id})
    assert create_resp.status_code == 201
    list_resp = client.get("/households?page=1&page_size=5&q=Hanna")
    assert list_resp.status_code == 200
    payload = list_resp.json()
    assert payload["total"] >= 1
    assert payload["items"][0]["members_count"] >= 1
    assert payload["items"][0]["head_member_name"].startswith("Hanna")


def test_delete_household_requires_empty(client, authorize, registrar_user, db_session):
    member = _create_member(db_session, "Abel", "Head")
    authorize(registrar_user)
    create_resp = client.post("/households", json={"name": "Abel Family"})
    household_id = create_resp.json()["id"]
    client.post(f"/households/{household_id}/members", json={"member_ids": [member.id]})

    delete_resp = client.delete(f"/households/{household_id}")
    assert delete_resp.status_code == 400

    client.post(f"/households/{household_id}/members", json={"member_ids": []})
    delete_resp = client.delete(f"/households/{household_id}")
    assert delete_resp.status_code == 204
