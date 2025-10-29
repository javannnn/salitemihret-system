"""Scheduler and request hooks for RBAC fixtures."""

from __future__ import annotations

import json
import logging
from pathlib import Path

LOGGER = logging.getLogger(__name__)

APP_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_ROOT = APP_ROOT / "fixtures"
ROLES_FIXTURE = FIXTURE_ROOT / "roles.json"
DOCPERM_FIXTURE = FIXTURE_ROOT / "custom_docperm.json"


def _load(path: Path) -> list[dict]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        LOGGER.warning("Fixture %s not found", path)
        return []


def sync_role_permission_fixtures() -> None:
    roles = _load(ROLES_FIXTURE)
    perms = _load(DOCPERM_FIXTURE)
    LOGGER.info(
        "RBAC fixture sync placeholder executed (roles=%s, docperms=%s)",
        len(roles),
        len(perms),
    )


def verify_role_matrix_integrity() -> None:
    perms = _load(DOCPERM_FIXTURE)
    targets = {entry.get("parent") for entry in perms}
    LOGGER.info(
        "RBAC matrix integrity check placeholder (targets=%s)",
        ", ".join(sorted(filter(None, targets))) or "<none>",
    )


def ensure_session_policies() -> None:
    LOGGER.debug("Session policy enforcement placeholder invoked")
