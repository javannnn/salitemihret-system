import logging

import app.models
try:
    from apscheduler.schedulers.background import BackgroundScheduler
except ImportError:  # pragma: no cover - optional dependency fallback
    BackgroundScheduler = None  # type: ignore[assignment]
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text


from app.config import UPLOAD_DIR
from app.core.config import settings
from app.core.db import SessionLocal, engine
from app.core.license import get_license_status
from app.routers import auth as auth_router
from app.routers import children as children_router
from app.routers import license as license_router
from app.routers import members as members_router
from app.routers import members_bulk as members_bulk_router
from app.routers import members_files as members_files_router
from app.routers import priests as priests_router
from app.routers import payments as payments_router
from app.routers import whoami as whoami_router
from app.routers import sponsorships as sponsorships_router
from app.routers import newcomers as newcomers_router
from app.services.child_promotion import get_children_ready_for_promotion
from app.services import payments as payments_service

app = FastAPI(title="SaliteMihret API", version="0.1.0")

logger = logging.getLogger(__name__)

if BackgroundScheduler is not None:
    scheduler = BackgroundScheduler(timezone="UTC")
else:  # pragma: no cover - fallback when APScheduler unavailable
    class _DummyScheduler:
        def __init__(self) -> None:
            self.running = False

        def start(self) -> None:
            logger.warning("APScheduler not installed; promotion digest disabled")
            self.running = True

        def add_job(self, *args, **kwargs) -> None:
            logger.debug("Skipped scheduling job %s because APScheduler is missing", kwargs.get("id"))

        def shutdown(self, wait: bool = False) -> None:
            self.running = False

    scheduler = _DummyScheduler()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(whoami_router.router)
app.include_router(priests_router.router)
app.include_router(children_router.router)
app.include_router(members_files_router.router)
app.include_router(members_bulk_router.router)
app.include_router(members_router.router)
app.include_router(payments_router.router)
app.include_router(sponsorships_router.router)
app.include_router(newcomers_router.router)
app.include_router(license_router.router)
app.mount("/static", StaticFiles(directory=UPLOAD_DIR.parent), name="static")

LICENSE_EXEMPT_PATHS = {"/health", "/license/status", "/license/activate", "/auth/login"}
LICENSE_EXEMPT_PREFIXES = ("/static", "/docs", "/redoc", "/openapi")


@app.middleware("http")
async def enforce_license(request: Request, call_next):
    path = request.url.path
    if path in LICENSE_EXEMPT_PATHS or any(path.startswith(prefix) for prefix in LICENSE_EXEMPT_PREFIXES):
        return await call_next(request)
    status_obj = get_license_status()
    if status_obj.is_enforced:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "detail": status_obj.message,
                "code": "license_inactive",
                "state": status_obj.state,
                "days_remaining": status_obj.days_remaining,
            },
        )
    return await call_next(request)

@app.on_event("startup")
def ensure_optional_columns() -> None:
    """Guard optional columns so legacy databases don't error."""

    if engine.dialect.name != "postgresql":
        # SQLite-based test runs skip Postgres-specific guards.
        return

    with engine.begin() as connection:
        # Ensure marital status enum exists
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_type WHERE typname = 'member_marital_status'
                    ) THEN
                        CREATE TYPE member_marital_status AS ENUM (
                            'Single',
                            'Married',
                            'Divorced',
                            'Widowed',
                            'Separated',
                            'Other'
                        );
                    END IF;
                END
                $$;
                """
            )
        )

        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_type WHERE typname = 'member_gender'
                    ) THEN
                        CREATE TYPE member_gender AS ENUM (
                            'Male',
                            'Female',
                            'Other'
                        );
                    END IF;
                END
                $$;
                """
            )
        )
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM pg_type WHERE typname = 'member_status'
                    ) THEN
                        IF NOT EXISTS (
                            SELECT 1
                            FROM pg_enum e
                            JOIN pg_type t ON e.enumtypid = t.oid
                            WHERE t.typname = 'member_status' AND e.enumlabel = 'Pending'
                        ) THEN
                            ALTER TYPE member_status ADD VALUE 'Pending';
                        END IF;
                    END IF;
                END
                $$;
                """
            )
        )

        # Optional priests table for father confessor relationship
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS priests (
                    id SERIAL PRIMARY KEY,
                    full_name VARCHAR(150) UNIQUE NOT NULL,
                    phone VARCHAR(50),
                    email VARCHAR(120),
                    status VARCHAR(50) NOT NULL DEFAULT 'Active',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
        )
        connection.execute(
            text(
                "ALTER TABLE priests ADD COLUMN IF NOT EXISTS phone VARCHAR(50)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE priests ADD COLUMN IF NOT EXISTS email VARCHAR(120)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE priests ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'Active'"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE priests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
            )
        )

        connection.execute(
            text(
                "ALTER TABLE children "
                "ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMP"
            )
        )

        connection.execute(
            text(
                "ALTER TABLE members ADD COLUMN IF NOT EXISTS baptismal_name VARCHAR(150)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE members ADD COLUMN IF NOT EXISTS marital_status member_marital_status"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE members ADD COLUMN IF NOT EXISTS address_street VARCHAR(255)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE members ADD COLUMN IF NOT EXISTS address_city VARCHAR(120)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE members ADD COLUMN IF NOT EXISTS address_region VARCHAR(120)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE members ADD COLUMN IF NOT EXISTS address_postal_code VARCHAR(30)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE members ADD COLUMN IF NOT EXISTS address_country VARCHAR(120)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE members ADD COLUMN IF NOT EXISTS pays_contribution BOOLEAN NOT NULL DEFAULT FALSE"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE members ADD COLUMN IF NOT EXISTS household_size_override INTEGER"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE members ADD COLUMN IF NOT EXISTS has_father_confessor BOOLEAN NOT NULL DEFAULT FALSE"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE members ADD COLUMN IF NOT EXISTS father_confessor_id INTEGER REFERENCES priests(id) ON DELETE SET NULL"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE members ALTER COLUMN pays_contribution DROP DEFAULT"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE members ALTER COLUMN has_father_confessor DROP DEFAULT"
            )
        )

        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_type WHERE typname = 'member_contribution_exception_reason'
                    ) THEN
                        CREATE TYPE member_contribution_exception_reason AS ENUM (
                            'LowIncome',
                            'Senior',
                            'Student',
                            'Other'
                        );
                    END IF;
                END
                $$;
                """
            )
        )
        connection.execute(
            text(
                "ALTER TABLE members ADD COLUMN IF NOT EXISTS contribution_currency VARCHAR(3)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE members ADD COLUMN IF NOT EXISTS contribution_exception_reason member_contribution_exception_reason"
            )
        )
        connection.execute(
            text(
                "UPDATE members SET contribution_currency = 'CAD' WHERE contribution_currency IS NULL"
            )
        )
        connection.execute(
            text(
                "UPDATE members SET contribution_amount = 75 WHERE contribution_amount IS NULL"
            )
        )
        connection.execute(
            text(
                "UPDATE members SET pays_contribution = TRUE WHERE pays_contribution IS DISTINCT FROM TRUE"
            )
        )

        connection.execute(
            text(
                "ALTER TABLE spouses ADD COLUMN IF NOT EXISTS first_name VARCHAR(120)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE spouses ADD COLUMN IF NOT EXISTS last_name VARCHAR(120)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE spouses ADD COLUMN IF NOT EXISTS gender member_gender"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE spouses ADD COLUMN IF NOT EXISTS country_of_birth VARCHAR(120)"
            )
        )

        connection.execute(
            text(
                "ALTER TABLE children ADD COLUMN IF NOT EXISTS first_name VARCHAR(120)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE children ADD COLUMN IF NOT EXISTS last_name VARCHAR(120)"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE children ADD COLUMN IF NOT EXISTS gender member_gender"
            )
        )
        connection.execute(
            text(
                "ALTER TABLE children ADD COLUMN IF NOT EXISTS country_of_birth VARCHAR(120)"
            )
        )


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


def _send_promotion_digest() -> None:
    with SessionLocal() as session:
        candidates = get_children_ready_for_promotion(session, within_days=60)
        if not candidates:
            return
        logger.info(
            "child_promotion_digest",
            extra={
                "total_candidates": len(candidates),
                "child_ids": [child.id for child, _ in candidates],
            },
        )

def _run_overdue_payment_check() -> None:
    with SessionLocal() as session:
        updated = payments_service.check_overdue_payments(session)
        if updated:
            logger.info("payment_overdue_job", extra={"updated": updated})


def _run_daily_close_job() -> None:
    with SessionLocal() as session:
        lock = payments_service.auto_close_previous_day(session)
        if lock:
            logger.info("payment_daily_close", extra={"day": lock.day.isoformat()})


@app.on_event("startup")
def start_scheduled_jobs() -> None:
    if not scheduler.running:
        scheduler.start()
    scheduler.add_job(
        _send_promotion_digest,
        trigger="cron",
        hour=2,
        minute=0,
        id="promotion_digest",
        replace_existing=True,
    )
    scheduler.add_job(
        _run_overdue_payment_check,
        trigger="cron",
        hour=3,
        minute=0,
        id="payment_overdue_check",
        replace_existing=True,
    )
    scheduler.add_job(
        _run_daily_close_job,
        trigger="cron",
        hour=2,
        minute=5,
        id="payment_daily_close",
        replace_existing=True,
    )


@app.on_event("shutdown")
def shutdown_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
