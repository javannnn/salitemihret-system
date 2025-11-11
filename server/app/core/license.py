from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Literal

from jose import JWTError, jwt

from app.config import BASE_DIR

MODULE_DIR = Path(__file__).resolve().parent

LICENSE_DIR = BASE_DIR / "runtime"
LICENSE_DIR.mkdir(parents=True, exist_ok=True)
LICENSE_STATE_PATH = LICENSE_DIR / "license_state.json"
LICENSE_TOKEN_PATH = LICENSE_DIR / "license.key"
LICENSE_PUBLIC_KEY_PATH = MODULE_DIR / "license_public_key.pem"

DEFAULT_TRIAL_DAYS = int(os.getenv("LICENSE_TRIAL_DAYS", "365"))
LICENSE_PUBLIC_KEY = LICENSE_PUBLIC_KEY_PATH.read_text(encoding="utf-8").strip()


class LicenseValidationError(Exception):
    """Raised when a license token cannot be validated."""


@dataclass
class LicenseStatus:
    state: Literal["trial", "active", "expired", "invalid"]
    message: str
    expires_at: datetime | None
    trial_expires_at: datetime
    days_remaining: int
    customer: str | None
    payload: dict[str, Any] | None = None

    @property
    def is_enforced(self) -> bool:
        return self.state in {"expired", "invalid"}


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _load_trial_started_at() -> datetime:
    state = _read_json(LICENSE_STATE_PATH)
    if state and "trial_started_at" in state:
        try:
            return datetime.fromisoformat(state["trial_started_at"])
        except ValueError:
            pass

    now = datetime.now(UTC)
    _write_json(LICENSE_STATE_PATH, {"trial_started_at": now.isoformat()})
    return now


def _load_token() -> str | None:
    if LICENSE_TOKEN_PATH.exists():
        token = LICENSE_TOKEN_PATH.read_text(encoding="utf-8").strip()
        if token:
            return token
    env_token = os.getenv("LICENSE_TOKEN")
    if env_token:
        return env_token.strip()
    return None


def _persist_token(token: str) -> None:
    LICENSE_TOKEN_PATH.write_text(token.strip(), encoding="utf-8")


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        raise LicenseValidationError("License payload missing expires_at")
    if value.endswith("Z"):
        value = value.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(value)
    except ValueError as exc:
        raise LicenseValidationError("Invalid expires_at format") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


def _decode_license(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, LICENSE_PUBLIC_KEY, algorithms=["RS256"])
    except JWTError as exc:
        raise LicenseValidationError("License signature invalid") from exc


def _days_remaining(target: datetime, now: datetime) -> int:
    if target <= now:
        return 0
    delta = target - now
    return max(int(delta.total_seconds() // 86400) + 1, 0)


def get_license_status() -> LicenseStatus:
    now = datetime.now(UTC)
    trial_started_at = _load_trial_started_at()
    trial_expires_at = trial_started_at + timedelta(days=DEFAULT_TRIAL_DAYS)
    token = _load_token()

    if token:
        try:
            payload = _decode_license(token)
            expires_at = _parse_datetime(payload.get("expires_at"))
            customer = payload.get("customer")
            days_remaining = _days_remaining(expires_at, now)
            if expires_at <= now:
                return LicenseStatus(
                    state="expired",
                    message="The installed license expired. Please upload a new license to continue.",
                    expires_at=expires_at,
                    trial_expires_at=trial_expires_at,
                    days_remaining=0,
                    customer=customer,
                    payload=payload,
                )
            return LicenseStatus(
                state="active",
                message="A valid license is active.",
                expires_at=expires_at,
                trial_expires_at=trial_expires_at,
                days_remaining=days_remaining,
                customer=customer,
                payload=payload,
            )
        except LicenseValidationError as exc:
            return LicenseStatus(
                state="invalid",
                message=str(exc),
                expires_at=None,
                trial_expires_at=trial_expires_at,
                days_remaining=0,
                customer=None,
                payload=None,
            )

    if now <= trial_expires_at:
        days_remaining = _days_remaining(trial_expires_at, now)
        return LicenseStatus(
            state="trial",
            message="Trial mode active.",
            expires_at=trial_expires_at,
            trial_expires_at=trial_expires_at,
            days_remaining=days_remaining,
            customer=None,
            payload=None,
        )

    return LicenseStatus(
        state="expired",
        message="The evaluation period has ended. Install a license to continue.",
        expires_at=trial_expires_at,
        trial_expires_at=trial_expires_at,
        days_remaining=0,
        customer=None,
        payload=None,
    )


def activate_license(token: str) -> LicenseStatus:
    if not token.strip():
        raise LicenseValidationError("License token cannot be empty")
    _persist_token(token.strip())
    return get_license_status()
