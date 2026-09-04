from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    model_config = {"env_prefix": "PUBSECGIS_"}


settings = Settings()
