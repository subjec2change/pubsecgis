"""Shared fixtures for the PUBSECGIS backend test suite.

Conventions (hard rules):
  - Every test-owned floorplan row uses a floor_id of the form
    'zzz-test-<uuid4-hex>.floor' and is deleted in fixture teardown.
  - Tests NEVER truncate/wipe the floorplans table — it holds production rows.
  - Row-level assertions filter on a per-test unique token so they can never
    accidentally match production data.
"""
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import delete, func, select

from models.database import Floorplan, async_session, engine

TEST_PREFIX = "zzz-test-"


@pytest_asyncio.fixture(autouse=True)
async def _dispose_engine_after_test():
    """pytest-asyncio gives each test its own event loop, but the app's
    engine pools asyncpg connections. A pooled connection created in one
    test's loop breaks in the next ('another operation is in progress').
    Dispose the pool after every test so each test dials a fresh connection.
    Runs last on teardown (autouse → set up first), after DB fixtures."""
    yield
    await engine.dispose()


def unique_token(prefix: str = "fp") -> str:
    """A token guaranteed not to collide with production or other tests."""
    return f"{TEST_PREFIX}{prefix}{uuid.uuid4().hex[:12]}"


def test_floor_id() -> str:
    """floor_id like 'zzz-test-<uuid4-hex>.floor' (<= 60 chars, String(60) col)."""
    return f"{TEST_PREFIX}{uuid.uuid4().hex}.floor"


@pytest_asyncio.fixture
async def db():
    """Real async session against the dev Postgres (live DB is the test DB)."""
    async with async_session() as session:
        yield session


@pytest_asyncio.fixture
async def floorplan_factory(db):
    """Create Floorplan rows, delete exactly those rows on teardown.

    The teardown also asserts that no 'zzz-test-' rows leaked.
    Callers must pass per-test unique values for campus/building/
    floor_name/building_id if they assert on search results.
    """
    created: list[str] = []

    async def make(**overrides):
        defaults = dict(
            floor_id=test_floor_id(),
            campus="ZZZTEST Campus",
            building="ZZZTEST Building",
            building_id="zzz-test-bldg",
            floor_name="ZZZTEST L1",
            image="zzz-test-placeholder.png",
            south=38.60,
            west=-90.26,
            north=38.63,
            east=-90.22,
            rotation=0,
            active=True,
            notes=None,
        )
        defaults.update(overrides)
        fp = Floorplan(**defaults)
        db.add(fp)
        await db.commit()
        await db.refresh(fp)
        created.append(str(fp.floor_id))
        return fp

    def register(*floor_ids: str) -> None:
        """Track test rows created outside make() (e.g. via route functions)."""
        created.extend(str(fid) for fid in floor_ids)

    make.register = register  # type: ignore[attr-defined]

    yield make

    for fid in created:
        await db.execute(delete(Floorplan).where(Floorplan.floor_id == fid))
    await db.commit()
    leaked = (
        await db.execute(
            select(func.count())
            .select_from(Floorplan)
            .where(Floorplan.floor_id.like(f"{TEST_PREFIX}%"))
        )
    ).scalar()
    assert leaked == 0, f"leaked zzz-test- floorplan rows: {leaked}"
