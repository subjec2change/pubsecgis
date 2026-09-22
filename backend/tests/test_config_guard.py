"""Config startup-guard tests (config.validate_settings_for_env).

Settings instances are built directly (not by mutating app state). Note the
class-level env_prefix PUBSECGIS_ means ambient PUBSECGIS_* env vars would
override explicit kwargs, so these tests clear them via monkeypatch.

Covers:
  - production + shipped defaults -> RuntimeError naming the offenders.
  - production + overrides -> silent.
  - development + defaults -> UserWarning naming the offenders, no raise.
  - development + overrides -> silent.
"""
import warnings

import pytest

from config import Settings, validate_settings_for_env

DEFAULT_SECRET = "change-me-in-production"
DEFAULT_DB_URL = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"


@pytest.fixture(autouse=True)
def _clear_ambient_env(monkeypatch):
    """Isolate from the shell so explicit kwargs always win."""
    monkeypatch.delenv("PUBSECGIS_SECRET_KEY", raising=False)
    monkeypatch.delenv("PUBSECGIS_DATABASE_URL", raising=False)
    monkeypatch.delenv("PUBSECGIS_ENVIRONMENT", raising=False)


# ──────────────────────────────────────────────
# Production gate
# ──────────────────────────────────────────────

class TestProductionGuard:
    """Production must refuse to boot on shipped defaults."""

    def test_raises_on_both_defaults(self):
        s = Settings(environment="production")
        assert s.secret_key == DEFAULT_SECRET and s.database_url == DEFAULT_DB_URL
        with pytest.raises(RuntimeError) as excinfo:
            validate_settings_for_env(s)
        msg = str(excinfo.value)
        assert "secret_key" in msg and "database_url" in msg
        assert "PUBSECGIS_SECRET_KEY" in msg and "PUBSECGIS_DATABASE_URL" in msg

    def test_raises_on_default_secret_only(self):
        """Overridden DB but default secret still trips the guard."""
        s = Settings(environment="production", database_url="postgresql+asyncpg://u:p@db:5432/prod")
        with pytest.raises(RuntimeError) as excinfo:
            validate_settings_for_env(s)
        msg = str(excinfo.value)
        assert "secret_key" in msg
        assert "database_url" not in msg.split("default settings: ")[1].split(".")[0]

    def test_raises_on_default_db_url_only(self):
        """Overridden secret but default DB URL still trips the guard."""
        s = Settings(environment="production", secret_key="a-real-secret")
        with pytest.raises(RuntimeError) as excinfo:
            validate_settings_for_env(s)
        assert "database_url" in str(excinfo.value)

    def test_silent_when_both_overridden(self):
        """Fully-overridden production settings pass with no error, no warning."""
        s = Settings(environment="production", secret_key="a-real-secret", database_url="postgresql+asyncpg://u:p@db:5432/prod")
        with warnings.catch_warnings():
            warnings.simplefilter("error")  # any warning becomes a failure
            validate_settings_for_env(s)

    def test_environment_case_insensitive(self):
        """Guard compares environment case-insensitively."""
        s = Settings(environment="Production")
        with pytest.raises(RuntimeError):
            validate_settings_for_env(s)


# ──────────────────────────────────────────────
# Development behavior
# ──────────────────────────────────────────────

class TestDevelopmentBehavior:
    """Development warns but never raises."""

    def test_warns_on_defaults(self):
        """Dev + defaults -> UserWarning listing offenders, no exception."""
        s = Settings(environment="development")
        with pytest.warns(UserWarning, match="DEV DEFAULTS") as caught:
            validate_settings_for_env(s)
        msg = str(caught[0].message)
        assert "secret_key" in msg and "database_url" in msg

    def test_silent_when_overridden(self):
        """Dev + real values -> nothing raised, nothing warned."""
        s = Settings(environment="development", secret_key="a-real-secret", database_url="postgresql+asyncpg://u:p@db:5432/prod")
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            validate_settings_for_env(s)

    def test_warns_once_per_offender_set(self):
        """Partial override warns naming exactly the offending key."""
        s = Settings(environment="development", database_url="postgresql+asyncpg://u:p@db:5432/prod")
        with pytest.warns(UserWarning) as caught:
            validate_settings_for_env(s)
        msg = str(caught[0].message)
        assert "secret_key" in msg
        assert "database_url" not in msg.split("DEV DEFAULTS in use: ")[1].split(" —")[0]


# ──────────────────────────────────────────────
# Default-argument behavior
# ──────────────────────────────────────────────

class TestGuardDefaults:
    """validate_settings_for_env(None) falls back to the module settings."""

    def test_none_uses_module_settings_dev_warn(self, monkeypatch):
        """Development settings with default secrets warn, do not raise.

        monkeypatch instead of reading real module settings: CI exports
        PUBSECGIS_* overrides, so host env must not decide the outcome.
        """
        from config import settings as module_settings

        monkeypatch.setattr(module_settings, "environment", "development")
        monkeypatch.setattr(module_settings, "secret_key", "change-me-in-production")
        monkeypatch.setattr(
            module_settings,
            "database_url",
            "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev",
        )
        with pytest.warns(UserWarning):
            validate_settings_for_env()
