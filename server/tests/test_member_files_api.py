from __future__ import annotations

from pathlib import Path

from app.routers import members_files


def _configure_upload_dirs(monkeypatch, tmp_path):
    uploads_root = tmp_path / "uploads"
    avatar_dir = uploads_root / "avatars"
    attachment_dir = uploads_root / "member-attachments"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    attachment_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(members_files, "UPLOAD_DIR", avatar_dir)
    monkeypatch.setattr(members_files, "MEMBER_ATTACHMENT_UPLOAD_DIR", attachment_dir)
    return attachment_dir


def test_upload_low_income_attachment_requires_low_income_exception(
    client,
    authorize,
    admin_user,
    sample_member,
    db_session,
    monkeypatch,
    tmp_path,
):
    _configure_upload_dirs(monkeypatch, tmp_path)
    sample_member.contribution_exception_reason = None
    db_session.commit()

    authorize(admin_user)
    response = client.post(
        f"/members/{sample_member.id}/contribution-exception-attachment",
        files={"file": ("proof.pdf", b"%PDF-1.4 sample", "application/pdf")},
    )

    assert response.status_code == 400
    assert "Low income" in response.text


def test_upload_low_income_attachment_accepts_exception_reason_form_field(
    client,
    authorize,
    admin_user,
    sample_member,
    db_session,
    monkeypatch,
    tmp_path,
):
    _configure_upload_dirs(monkeypatch, tmp_path)
    sample_member.contribution_exception_reason = None
    db_session.commit()

    authorize(admin_user)
    response = client.post(
        f"/members/{sample_member.id}/contribution-exception-attachment",
        data={"exception_reason": "LowIncome"},
        files={"file": ("proof.pdf", b"%PDF-1.4 sample", "application/pdf")},
    )

    assert response.status_code == 200, response.text
    db_session.refresh(sample_member)
    assert sample_member.contribution_exception_reason == "LowIncome"
    assert sample_member.contribution_exception_attachment_path


def test_upload_and_delete_low_income_attachment(
    client,
    authorize,
    admin_user,
    sample_member,
    db_session,
    monkeypatch,
    tmp_path,
):
    attachment_dir = _configure_upload_dirs(monkeypatch, tmp_path)
    sample_member.contribution_exception_reason = "LowIncome"
    db_session.commit()

    authorize(admin_user)
    upload = client.post(
        f"/members/{sample_member.id}/contribution-exception-attachment",
        files={"file": ("proof.pdf", b"%PDF-1.4 sample", "application/pdf")},
    )
    assert upload.status_code == 200, upload.text
    payload = upload.json()
    assert payload["attachment_url"].startswith("/static/member-attachments/")
    assert payload["attachment_name"] == "proof.pdf"

    db_session.refresh(sample_member)
    assert sample_member.contribution_exception_attachment_path
    uploaded_filename = Path(sample_member.contribution_exception_attachment_path).name
    uploaded_file = attachment_dir / uploaded_filename
    assert uploaded_file.exists()

    remove = client.delete(f"/members/{sample_member.id}/contribution-exception-attachment")
    assert remove.status_code == 204, remove.text
    db_session.refresh(sample_member)
    assert sample_member.contribution_exception_attachment_path is None
    assert not uploaded_file.exists()
