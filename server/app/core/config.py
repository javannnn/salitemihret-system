from decimal import Decimal

from pydantic_settings import BaseSettings


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

    class Config:
        env_file = ".env"


settings = Settings()
