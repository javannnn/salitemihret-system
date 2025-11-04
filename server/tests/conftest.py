from __future__ import annotations

from collections.abc import Generator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.auth.deps import get_current_user
from app.core.db import Base, get_db
from app.main import app
from app.models.member import Member
from app.models.role import Role
from app.models.user import User

SQLALCHEMY_TEST_URL = "sqlite+pysqlite:///:memory:"
engine = create_engine(SQLALCHEMY_TEST_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def override_get_db() -> Generator[Session, None, None]:
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
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
def client(db_session: Session) -> Generator[TestClient, None, None]:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def authorize(client: TestClient):
    def _apply(user: User):
        app.dependency_overrides[get_current_user] = lambda: user

    yield _apply
    app.dependency_overrides.pop(get_current_user, None)


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
    user = User(email="pr@example.com", full_name="PR Admin", hashed_password="hash", is_active=True)
    user.roles.append(role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def office_admin_user(db_session: Session) -> User:
    role = _ensure_role(db_session, "OfficeAdmin")
    user = User(email="office@example.com", full_name="Registrar", hashed_password="hash", is_active=True)
    user.roles.append(role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def registrar_user(db_session: Session) -> User:
    role = _ensure_role(db_session, "Registrar")
    user = User(email="registrar@example.com", full_name="Registrar", hashed_password="hash", is_active=True)
    user.roles.append(role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def admin_user(db_session: Session) -> User:
    role = _ensure_role(db_session, "Admin")
    user = User(email="admin@example.com", full_name="Admin", hashed_password="hash", is_active=True)
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
        username="abeba.tesfaye",
        status="Active",
        gender="Female",
        district="Arada",
        join_date=date(2023, 1, 1),
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    return member
