"""Remove example business records while retaining staff and system configuration.

Dry-run by default. Run from server/ with its virtual environment. Applying requires
an independently verified PostgreSQL backup and no remaining visible members.
"""
import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import MetaData, select, text
from sqlalchemy.sql.ddl import sort_tables

KEEP = frozenset('alembic_version roles users user_roles user_audit_logs user_invitations payment_service_types parish_council_departments volunteer_groups ministries tags'.split())
CLEAR = frozenset('children members lessons member_contribution_payments households newcomer_address_history mezmur member_audit member_ministries member_tags messages newcomer_status_audits parish_council_assignments newcomer_interactions newcomers parish_council_audit_events payment_day_locks priests sponsorship_status_audits payments sponsorship_budget_rounds parish_council_documents payment_receipts sponsorship_notes sunday_school_audit_logs sunday_school_contents sunday_school_enrollments sponsorships spouses abenet_enrollments abenet_enrollment_payments user_member_links volunteer_workers'.split())


def clear_business_data(engine, *, apply=False, backup=None):
    metadata = MetaData()
    metadata.reflect(engine)
    actual = set(metadata.tables)
    if actual != KEEP | CLEAR:
        raise RuntimeError(f'Unexpected schema; refusing cleanup: extra={sorted(actual - KEEP - CLEAR)}, missing={sorted((KEEP | CLEAR) - actual)}')
    if apply and (not backup or not Path(backup).is_file() or Path(backup).stat().st_size == 0):
        raise RuntimeError('A verified, nonempty database backup is required')
    quote = engine.dialect.identifier_preparer.quote
    with engine.begin() as connection:
        if apply and engine.dialect.name == 'postgresql':
            connection.execute(text('SELECT pg_advisory_xact_lock(72610415)'))
            connection.execute(text('LOCK TABLE ' + ', '.join(quote(n) for n in sorted(actual - {'alembic_version'})) + ' IN EXCLUSIVE MODE'))
        counts = {n: connection.execute(text('SELECT count(*) FROM ' + quote(n))).scalar_one() for n in sorted(actual)}
        if connection.execute(text('SELECT count(*) FROM members WHERE deleted_at IS NULL')).scalar_one():
            raise RuntimeError('Visible members remain; refusing cleanup')
        if not connection.execute(text('SELECT count(*) FROM users WHERE is_super_admin = true AND is_active = true')).scalar_one():
            raise RuntimeError('No active super administrator; refusing cleanup')
        if not apply:
            return {'apply': False, 'remove': {n: counts[n] for n in sorted(CLEAR)}, 'preserve': {n: counts[n] for n in sorted(KEEP)}}
        # Invitation member references are explicitly allowed to become NULL; all
        # other account fields, password hashes, roles and audits must be identical.
        def preserved_rows(name):
            rows = [dict(row) for row in connection.execute(select(metadata.tables[name])).mappings()]
            if name == 'user_invitations':
                for row in rows:
                    row.pop('member_id', None)
            return sorted((repr(sorted(row.items())) for row in rows))
        before = {n: preserved_rows(n) for n in KEEP}
        # Break the nullable household/member cycle, then delete dependents first.
        connection.execute(text('UPDATE households SET head_member_id = NULL'))
        ordered = sort_tables(metadata.tables.values(), skip_fn=lambda fk: fk.parent.table.name == 'households' and fk.parent.name == 'head_member_id')
        for table in reversed(ordered):
            if table.name in CLEAR:
                connection.execute(table.delete())
        if any(connection.execute(text('SELECT count(*) FROM ' + quote(n))).scalar_one() for n in CLEAR):
            raise RuntimeError('Business records remain; rolling back')
        if before != {n: preserved_rows(n) for n in KEEP}:
            raise RuntimeError('Protected staff/configuration data changed; rolling back')
        return {'apply': True, 'removed': {n: counts[n] for n in sorted(CLEAR)}, 'preserved': {n: counts[n] for n in sorted(KEEP)}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--verified-backup', type=Path)
    args = parser.parse_args()
    sys.path.insert(0, str(Path.cwd()))
    from app.core.db import engine
    print(json.dumps(clear_business_data(engine, apply=args.apply, backup=args.verified_backup), indent=2))


if __name__ == '__main__':
    main()
