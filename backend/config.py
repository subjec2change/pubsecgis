from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    # "development" | "production". Production refuses to boot on defaults.
    environment: str = "development"

    model_config = {"env_prefix": "PUBSECGIS_"}


settings = Settings()

_DEV_DEFAULTS = {
    "secret_key": "change-me-in-production",
    "database_url": "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev",
}


def validate_settings_for_env(s: "Settings | None" = None):
    """Startup guard: production must not run on shipped defaults.

    Called from main.py lifespan so `uvicorn main:app` enforces it without
    extra flags. Development mode only warns (dev DB/kiosk stay unaffected).
    """
    s = s or settings
    offenders = [k for k, v in _DEV_DEFAULTS.items() if getattr(s, k) == v]
    if not offenders:
        return
    if s.environment.lower() == "production":
        raise RuntimeError(
            "Refusing to start in production with default settings: "
            + ", ".join(offenders)
            + ". Set PUBSECGIS_SECRET_KEY"
            + (" and PUBSECGIS_DATABASE_URL" if "database_url" in offenders else "")
            + "."
        )
    import warnings

    warnings.warn(
        "DEV DEFAULTS in use: " + ", ".join(offenders) + " — set them before production.",
        stacklevel=2,
    )
