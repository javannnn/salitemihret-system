"""Guardrails for production example-data cleanup, on an isolated database."""
from datetime import datetime
from pathlib import Path
import runpy
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from app.core.db import Base
from app.models.user import User
from app.models.member import Member
cleanup = runpy.run_path(str(Path(__file__).resolve().parents[2] / 'scripts' / 'clear-business-data.py'))['clear_business_data']

@pytest.fixture
def cleanup_database(tmp_path):
    engine = create_engine('sqlite+pysqlite:///' + str(tmp_path / 'cleanup.db'))
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE alembic_version (version_num VARCHAR PRIMARY KEY)'))
    with Session(engine) as session:
        session.add(User(email='retained@example.com', username='retained', hashed_password='unchanged', is_active=True, is_super_admin=True))
        session.add(Member(first_name='Sample', last_name='Member', username='sample', email='sample@example.com', status='Archived', deleted_at=datetime.utcnow()))
        session.commit()
    backup = tmp_path / 'verified.dump'
    backup.write_bytes(b'isolated test backup marker')
    yield engine, backup
    engine.dispose()


def test_cleanup_preserves_accounts_and_removes_business_data(cleanup_database):
    engine, backup = cleanup_database
    assert cleanup(engine)['remove']['members'] == 1
    with engine.connect() as connection:
        assert connection.execute(text('SELECT count(*) FROM members')).scalar_one() == 1
    assert cleanup(engine, apply=True, backup=backup)['preserved']['users'] == 1
    with engine.connect() as connection:
        assert connection.execute(text('SELECT hashed_password FROM users')).scalar_one() == 'unchanged'
        assert connection.execute(text('SELECT count(*) FROM members')).scalar_one() == 0


def test_cleanup_refuses_visible_members_and_missing_backup(cleanup_database):
    engine, backup = cleanup_database
    with pytest.raises(RuntimeError, match='backup'):
        cleanup(engine, apply=True)
    with engine.begin() as connection:
        connection.execute(text('UPDATE members SET deleted_at = NULL'))
    with pytest.raises(RuntimeError, match='Visible members'):
        cleanup(engine, apply=True, backup=backup)
    with engine.connect() as connection:
        assert connection.execute(text('SELECT count(*) FROM members')).scalar_one() == 1


def test_cleanup_refuses_unknown_tables(cleanup_database):
    engine, backup = cleanup_database
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE future_business_data (id INTEGER)'))
    with pytest.raises(RuntimeError, match='Unexpected schema'):
        cleanup(engine, apply=True, backup=backup)
