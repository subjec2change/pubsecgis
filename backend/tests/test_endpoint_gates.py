"""Auth gates on previously-anonymous read endpoints.

Seam: the REAL `main.app` (same routers, prefixes, and dependencies as
production) driven through httpx ASGITransport — because these gates live in
the include_router wiring in main.py, and a mini-app with its own wiring
would only test the test.

Policy (user, 2026-09-22):
- officer dashboard + heatmap/trends + locations: authenticated or public, left as-is
- /api/broadcast/*: PUBLIC by design (kiosk screens have no login)
- /api/users, /api/shifts GET, /api/handoff/notes GET: require authentication
- reports/export.csv: lead/admin (tested in test_shift_report_routes.py)
"""
from datetime import date

import httpx
import pytest
from sqlalchemy import delete, select

from dependencies import create_access_token
from models.database import User, async_session, engine

BASE = "http://test"


async def _client():
    from main import app

    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE)


@pytest.fixture
async def gate_officer():
    """Ephemeral officer — CI's fresh DB has no seed users (lesson 21e2493)."""
    async with async_session() as db:
        user = User(username="zzz-test-gate-officer", display_name="ZZZ Gate Officer",
                    role="officer", active=True)
        db.add(user)
        await db.commit()
        yield user.username
        await db.execute(delete(User).where(User.username == "zzz-test-gate-officer"))
        await db.commit()
        await engine.dispose()


class TestAnonymousBlocked:
    """These three returned 200 to any anonymous device on the network."""

    async def test_users_directory_requires_auth(self):
        async with await _client() as c:
            assert (await c.get("/api/users")).status_code == 401

    async def test_shifts_list_requires_auth(self):
        async with await _client() as c:
            assert (await c.get("/api/shifts")).status_code == 401

    async def test_handoff_notes_list_requires_auth(self):
        async with await _client() as c:
            assert (await c.get("/api/handoff/notes")).status_code == 401

    async def test_bad_token_rejected_on_users(self):
        async with await _client() as c:
            r = await c.get("/api/users", headers={"Authorization": "***"})
            assert r.status_code == 401


class TestAuthenticatedOfficerAllowed:
    """Officers legitimately use all three; gating must not break them."""

    async def test_officer_reads_user_directory(self, gate_officer):
        async with await _client() as c:
            c.headers["Authorization"] = f"Bearer {create_access_token({'sub': gate_officer})}"
            r = await c.get("/api/users")
            assert r.status_code == 200

    async def test_officer_lists_shifts(self, gate_officer):
        async with await _client() as c:
            c.headers["Authorization"] = f"Bearer {create_access_token({'sub': gate_officer})}"
            r = await c.get("/api/shifts", params={"date": date.today().isoformat()})
            assert r.status_code == 200

    async def test_officer_reads_handoff_notes(self, gate_officer):
        async with await _client() as c:
            c.headers["Authorization"] = f"Bearer {create_access_token({'sub': gate_officer})}"
            r = await c.get("/api/handoff/notes")
            assert r.status_code == 200


class TestPublicKioskSurfaceStaysPublic:
    """Broadcast screens have no login — over-gating breaks the kiosks."""

    async def test_broadcast_incidents_public(self):
        async with await _client() as c:
            assert (await c.get("/api/broadcast/incidents")).status_code == 200

    async def test_broadcast_config_public(self):
        async with await _client() as c:
            assert (await c.get("/api/broadcast/config")).status_code == 200

    async def test_locations_public(self):
        """Location autocomplete is used pre-login context and carries no
        personnel data — intentionally left public."""
        async with await _client() as c:
            assert (await c.get("/api/locations")).status_code == 200

    async def test_health_public(self):
        async with await _client() as c:
            assert (await c.get("/api/health")).status_code == 200
