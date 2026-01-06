from decimal import Decimal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/saliteone"
    JWT_SECRET: str = "change-me"
    JWT_ALG: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ENVIRONMENT: str = "local"
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    ABENET_MONTHLY_AMOUNT: Decimal = Decimal("150.00")
    USER_INVITE_EXPIRY_HOURS: int = 72
    USERNAME_CHANGE_COOLDOWN_DAYS: int = 90
    RECAPTCHA_SECRET: str | None = None
    RECAPTCHA_MIN_SCORE: float = 0.5
    FRONTEND_BASE_URL: str = "http://localhost:5173"

    EMAIL_FROM_ADDRESS: str | None = None
    EMAIL_FROM_NAME: str = "St. Mary EOTC Edmonton"
    EMAIL_REPLY_TO: str | None = None
    EMAIL_SMTP_HOST: str | None = None
    EMAIL_SMTP_PORT: int = 465
    EMAIL_SMTP_USERNAME: str | None = None
    EMAIL_SMTP_PASSWORD: str | None = None
    EMAIL_SMTP_USE_SSL: bool = True
    EMAIL_SMTP_USE_TLS: bool = False
    EMAIL_TIMEOUT_SECONDS: int = 20
    EMAIL_FALLBACK_RECIPIENTS: str | None = None

    EMAIL_IMAP_HOST: str | None = None
    EMAIL_IMAP_PORT: int = 993
    EMAIL_IMAP_USERNAME: str | None = None
    EMAIL_IMAP_PASSWORD: str | None = None
    EMAIL_IMAP_USE_SSL: bool = True
    EMAIL_IMAP_USE_TLS: bool = False
    EMAIL_IMAP_FOLDER: str = "INBOX"
    EMAIL_IMAP_SENT_FOLDER: str = "INBOX.Sent"
    EMAIL_IMAP_DRAFTS_FOLDER: str = "INBOX.Drafts"
    EMAIL_IMAP_TRASH_FOLDER: str = "INBOX.Trash"

    CHILD_PROMOTION_DIGEST_LOOKAHEAD_DAYS: int = 60
    CHILD_PROMOTION_NOTIFY_ROLES: str | None = "Admin,PublicRelations"
    SPONSORSHIP_REMINDER_NOTIFY_ROLES: str | None = "Admin,PublicRelations"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="allow",
    )

    @property
    def EMAIL_FALLBACK_RECIPIENTS_LIST(self) -> list[str]:
        return _split_csv(self.EMAIL_FALLBACK_RECIPIENTS)

    @property
    def CHILD_PROMOTION_NOTIFY_ROLES_LIST(self) -> list[str]:
        return _split_csv(self.CHILD_PROMOTION_NOTIFY_ROLES)

    @property
    def SPONSORSHIP_REMINDER_NOTIFY_ROLES_LIST(self) -> list[str]:
        return _split_csv(self.SPONSORSHIP_REMINDER_NOTIFY_ROLES)


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


settings = Settings()
