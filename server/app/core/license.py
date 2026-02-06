from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Literal

import httpx
from jose import JWTError, jwt

from app.config import BASE_DIR
from app.core.config import settings

MODULE_DIR = Path(__file__).resolve().parent

LICENSE_DIR = BASE_DIR / "runtime"
LICENSE_DIR.mkdir(parents=True, exist_ok=True)
LICENSE_STATE_PATH = LICENSE_DIR / "license_state.json"
LICENSE_TOKEN_PATH = LICENSE_DIR / "license.key"
LICENSE_PUBLIC_KEY_PATH = MODULE_DIR / "license_public_key.pem"

DEFAULT_TRIAL_DAYS = int(os.getenv("LICENSE_TRIAL_DAYS", "90"))
LICENSE_PUBLIC_KEY = LICENSE_PUBLIC_KEY_PATH.read_text(encoding="utf-8").strip()
LICENSE_REMOTE_STATUS_URL = settings.LICENSE_REMOTE_STATUS_URL
LICENSE_REMOTE_CHECK_INTERVAL_HOURS = settings.LICENSE_REMOTE_CHECK_INTERVAL_HOURS
LICENSE_REMOTE_GRACE_DAYS = settings.LICENSE_REMOTE_GRACE_DAYS
LICENSE_REMOTE_TIMEOUT_SECONDS = settings.LICENSE_REMOTE_TIMEOUT_SECONDS
LICENSE_REMOTE_STATE_PATH = LICENSE_DIR / "license_remote.json"


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


def _parse_remote_datetime(value: str | None, field: str) -> datetime:
    if not value:
        raise LicenseValidationError(f"Remote license missing {field}")
    if value.endswith("Z"):
        value = value.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(value)
    except ValueError as exc:
        raise LicenseValidationError(f"Remote license {field} is invalid") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


def _parse_last_modified(value: str | None) -> datetime:
    if not value:
        raise LicenseValidationError("Remote license confirmation missing Last-Modified")
    try:
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError) as exc:
        raise LicenseValidationError("Remote license Last-Modified invalid") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _load_remote_cache(license_id: str) -> dict[str, Any] | None:
    cached = _read_json(LICENSE_REMOTE_STATE_PATH)
    if not cached or cached.get("license_id") != license_id:
        return None
    status = cached.get("status")
    if status not in {"active", "inactive"}:
        return None
    try:
        checked_at = _parse_remote_datetime(cached.get("checked_at"), "checked_at")
        valid_until = _parse_remote_datetime(cached.get("valid_until"), "valid_until")
    except LicenseValidationError:
        return None
    return {
        "license_id": license_id,
        "status": status,
        "checked_at": checked_at,
        "valid_until": valid_until,
        "source": cached.get("source"),
        "etag": cached.get("etag"),
    }


def _write_remote_cache(payload: dict[str, Any]) -> None:
    serialized = {
        "license_id": payload["license_id"],
        "status": payload["status"],
        "checked_at": payload["checked_at"].isoformat(),
        "valid_until": payload["valid_until"].isoformat(),
        "source": payload.get("source"),
        "etag": payload.get("etag"),
    }
    _write_json(LICENSE_REMOTE_STATE_PATH, serialized)


def _remote_cache_fresh(checked_at: datetime, now: datetime) -> bool:
    if LICENSE_REMOTE_CHECK_INTERVAL_HOURS <= 0:
        return False
    return (now - checked_at).total_seconds() <= LICENSE_REMOTE_CHECK_INTERVAL_HOURS * 3600


def _remote_cache_within_grace(checked_at: datetime, now: datetime) -> bool:
    if LICENSE_REMOTE_GRACE_DAYS <= 0:
        return False
    return (now - checked_at).total_seconds() <= LICENSE_REMOTE_GRACE_DAYS * 86400


def _extract_remote_entry(payload: dict[str, Any], license_id: str) -> dict[str, Any] | None:
    if payload.get("license_id") == license_id:
        return payload
    licenses = payload.get("licenses")
    if isinstance(licenses, dict):
        entry = licenses.get(license_id)
        if isinstance(entry, dict):
            return entry
        return None
    if isinstance(licenses, list):
        for entry in licenses:
            if isinstance(entry, dict) and entry.get("license_id") == license_id:
                return entry
    return None


def _fetch_remote_status(license_id: str) -> dict[str, Any]:
    if not LICENSE_REMOTE_STATUS_URL:
        raise LicenseValidationError("Remote license confirmation is not configured")
    try:
        with httpx.Client(timeout=LICENSE_REMOTE_TIMEOUT_SECONDS) as client:
            response = client.get(LICENSE_REMOTE_STATUS_URL, headers={"Accept": "application/json"})
            response.raise_for_status()
            text = response.text
            try:
                payload = response.json()
            except json.JSONDecodeError:
                payload = None
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        raise LicenseValidationError("Unable to verify license confirmation") from exc

    if isinstance(payload, dict):
        entry = _extract_remote_entry(payload, license_id)
        if not entry:
            raise LicenseValidationError("Remote license confirmation missing for this license")

        status = str(entry.get("status") or "").lower()
        if status not in {"active", "inactive"}:
            raise LicenseValidationError("Remote license status invalid")

        valid_until = _parse_remote_datetime(entry.get("valid_until"), "valid_until")

        return {
            "license_id": license_id,
            "status": status,
            "checked_at": datetime.now(UTC),
            "valid_until": valid_until,
            "source": LICENSE_REMOTE_STATUS_URL,
            "etag": response.headers.get("ETag"),
        }

    status_text = (text or "").strip().lower()
    if not status_text:
        raise LicenseValidationError("Remote license confirmation empty")
    status = status_text.split()[0]
    if status not in {"active", "inactive"}:
        raise LicenseValidationError("Remote license status invalid")
    last_modified = response.headers.get("Last-Modified")
    etag = response.headers.get("ETag")
    if last_modified:
        valid_until = _parse_last_modified(last_modified) + timedelta(days=365)
    elif not etag:
        raise LicenseValidationError("Remote license confirmation missing Last-Modified or ETag")
    else:
        valid_until = None
    return {
        "license_id": license_id,
        "status": status,
        "checked_at": datetime.now(UTC),
        "valid_until": valid_until,
        "source": LICENSE_REMOTE_STATUS_URL,
        "etag": etag,
    }


def _load_remote_status(license_id: str, now: datetime) -> dict[str, Any]:
    cached = _load_remote_cache(license_id)
    if cached and cached["status"] == "active" and cached["valid_until"] > now:
        if _remote_cache_fresh(cached["checked_at"], now):
            return cached

    try:
        fetched = _fetch_remote_status(license_id)
        if fetched["valid_until"] is None:
            etag = fetched.get("etag")
            if etag and cached and cached.get("etag") == etag:
                fetched["valid_until"] = cached["valid_until"]
            else:
                fetched["valid_until"] = now + timedelta(days=365)
        _write_remote_cache(fetched)
        return fetched
    except LicenseValidationError:
        if (
            cached
            and cached["status"] == "active"
            and cached["valid_until"] > now
            and _remote_cache_within_grace(cached["checked_at"], now)
        ):
            return cached
        raise


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
            license_id = payload.get("license_id")

            if LICENSE_REMOTE_STATUS_URL:
                if not license_id:
                    raise LicenseValidationError("License confirmation missing license id")
                remote_status = _load_remote_status(str(license_id), now)
                if remote_status["status"] != "active":
                    raise LicenseValidationError("License confirmation inactive")
                remote_valid_until = remote_status["valid_until"]
                if remote_valid_until <= now:
                    return LicenseStatus(
                        state="expired",
                        message="License confirmation expired. Please renew.",
                        expires_at=remote_valid_until,
                        trial_expires_at=trial_expires_at,
                        days_remaining=0,
                        customer=customer,
                        payload=payload,
                    )
                if remote_valid_until < expires_at:
                    expires_at = remote_valid_until
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
