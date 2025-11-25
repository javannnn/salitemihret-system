from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class RecaptchaError(Exception):
    pass


async def verify_recaptcha(token: str, remote_ip: Optional[str] = None) -> float:
    """
    Verify a reCAPTCHA v3 token with Google.
    Returns the score on success or raises RecaptchaError.
    """
    if not settings.RECAPTCHA_SECRET:
        raise RecaptchaError("reCAPTCHA not configured")

    data = {"secret": settings.RECAPTCHA_SECRET, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post("https://www.google.com/recaptcha/api/siteverify", data=data)
    except Exception as exc:  # pragma: no cover - network/path issues
        logger.exception("recaptcha request failed")
        raise RecaptchaError("Unable to verify reCAPTCHA") from exc

    if resp.status_code != 200:
        logger.error("recaptcha non-200 response", extra={"status_code": resp.status_code, "body": resp.text})
        raise RecaptchaError("Unable to verify reCAPTCHA")

    payload = resp.json()
    if not payload.get("success"):
        logger.warning("recaptcha validation failed", extra={"errors": payload.get("error-codes")})
        raise RecaptchaError("reCAPTCHA validation failed")

    score = payload.get("score")
    if score is None:
        raise RecaptchaError("Missing reCAPTCHA score")
    if score < settings.RECAPTCHA_MIN_SCORE:
        raise RecaptchaError("reCAPTCHA score too low")
    return float(score)
