from __future__ import annotations

from collections.abc import Generator
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import Session, sessionmaker

from app.auth.deps import get_current_active_user, get_current_user
import app.main as app_main
from app.core.license import LicenseStatus
from app.core.db import Base, get_db
from app.main import app
from app.models.member import Member
from app.models.member_audit import MemberAudit  # noqa: F401
from app.models.newcomer import Newcomer  # noqa: F401
from app.models.newcomer_tracking import (  # noqa: F401
    NewcomerAddressHistory,
    NewcomerInteraction,
    NewcomerStatusAudit,
)
from app.models.role import Role
from app.models.sponsorship import Sponsorship  # noqa: F401
from app.models.sponsorship_audit import SponsorshipStatusAudit  # noqa: F401
from app.models.sponsorship_note import SponsorshipNote  # noqa: F401
from app.models.user import User

SQLALCHEMY_TEST_URL = "sqlite+pysqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_TEST_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def _unique_username(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


def _unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}@example.com"


def override_get_db() -> Generator[Session, None, None]:
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    session = TestingSessionLocal()
    try:
        yield session
        session.commit()
    finally:
        session.close()


@pytest.fixture()
def client(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    def _override_get_db() -> Generator[Session, None, None]:
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    def _license_status() -> LicenseStatus:
        now = datetime.now(UTC)
        return LicenseStatus(
            state="active",
            message="Test license active",
            expires_at=now + timedelta(days=30),
            trial_expires_at=now + timedelta(days=30),
            days_remaining=30,
            customer="tests",
        )

    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = _override_get_db
    startup_handlers = list(app.router.on_startup)
    shutdown_handlers = list(app.router.on_shutdown)
    app.router.on_startup.clear()
    app.router.on_shutdown.clear()
    monkeypatch.setattr(app_main, "get_license_status", _license_status)
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.router.on_startup[:] = startup_handlers
        app.router.on_shutdown[:] = shutdown_handlers
        app.dependency_overrides.clear()


@pytest.fixture()
def authorize(client: TestClient):
    def _apply(user: User):
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_current_active_user] = lambda: user

    yield _apply
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_active_user, None)


def _ensure_role(session: Session, name: str) -> Role:
    role = session.query(Role).filter_by(name=name).first()
    if role is None:
        role = Role(name=name)
        session.add(role)
        session.commit()
        session.refresh(role)
    return role


@pytest.fixture()
def public_relations_user(db_session: Session) -> User:
    role = _ensure_role(db_session, "PublicRelations")
    user = User(
        email=_unique_email("pr"),
        username=_unique_username("pr.admin"),
        full_name="PR Admin",
        hashed_password="hash",
        is_active=True,
    )
    user.roles.append(role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def office_admin_user(db_session: Session) -> User:
    role = _ensure_role(db_session, "OfficeAdmin")
    user = User(
        email=_unique_email("office"),
        username=_unique_username("office.admin"),
        full_name="Registrar",
        hashed_password="hash",
        is_active=True,
    )
    user.roles.append(role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def registrar_user(db_session: Session) -> User:
    role = _ensure_role(db_session, "Registrar")
    user = User(
        email=_unique_email("registrar"),
        username=_unique_username("registrar.admin"),
        full_name="Registrar",
        hashed_password="hash",
        is_active=True,
    )
    user.roles.append(role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def sponsorship_user(db_session: Session) -> User:
    role = _ensure_role(db_session, "SponsorshipCommittee")
    user = User(
        email=_unique_email("sponsor"),
        username=_unique_username("sponsor.lead"),
        full_name="Sponsor Lead",
        hashed_password="hash",
        is_active=True,
    )
    user.roles.append(role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def admin_user(db_session: Session) -> User:
    role = _ensure_role(db_session, "Admin")
    user = User(
        email=_unique_email("admin"),
        username=_unique_username("admin.user"),
        full_name="Admin",
        hashed_password="hash",
        is_active=True,
    )
    user.roles.append(role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def parish_council_admin_user(db_session: Session) -> User:
    role = _ensure_role(db_session, "ParishCouncilAdmin")
    user = User(
        email=_unique_email("parish"),
        username=_unique_username("parish.admin"),
        full_name="Parish Council Admin",
        hashed_password="hash",
        is_active=True,
    )
    user.roles.append(role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def sample_member(db_session: Session) -> Member:
    member = Member(
        first_name="Abeba",
        middle_name="S.",
        last_name="Tesfaye",
        username=_unique_username("abeba.tesfaye"),
        email=_unique_email("member"),
        status="Active",
        gender="Female",
        district="Arada",
        join_date=date(2023, 1, 1),
        phone="+16135550100",
        pays_contribution=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    return member
