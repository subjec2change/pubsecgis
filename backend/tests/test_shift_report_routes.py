"""Shift report HTTP routes: gates, error contract, PDF bytes.

Seam: a mini FastAPI app mounting the real reports/export routers with the
real require_role dependency, driven with httpx ASGITransport + real JWTs —
because the auth gates live in FastAPI Depends wiring that direct function
calls would bypass.
"""
from datetime import date, datetime, time, timedelta, timezone as tz
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import delete, select

from dependencies import create_access_token, get_current_user, require_role
from models.database import Floorplan, Incident, Shift, User, async_session, engine
from models.schemas import IncidentCreate
from routes.floorplans import router as floorplans_router


def make_app() -> FastAPI:
    from routes.reports import router as reports_router

    app = FastAPI()
    app.include_router(reports_router, prefix="/api/reports")
    app.include_router(floorplans_router, prefix="/api/floorplans")
    return app


def token_for(role: str) -> str:
    return create_access_token({"sub": f"zzz-role-{role}", "role": role})


async def _as(role: str):
    """Client whose get_current_user resolves to a user with `role`."""
    from dependencies import security
    from fastapi import Depends

    fake_user = SimpleNamespace(id=1, username=f"zzz-{role}", display_name=f"ZZZ {role}",
                                role=role, active=True)

    app = make_app()

    async def override():
        return fake_user

    app.dependency_overrides[get_current_user] = override
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    client.headers["Authorization"] = f"Bearer {token_for(role)}"
    return client


@pytest.fixture
async def shift_with_data():
    """A real DAY shift (2099-01-15, past-but-unique, no collisions) with one
    incident + one handoff note; torn down by floor-id-independent deletes."""
    async with async_session() as db:
        shift = Shift(shift_date=date(2026, 9, 17), shift_code="DAY",
                      start_time=time(6, 30), end_time=time(15, 0))
        db.add(shift)
        await db.commit()
        await db.refresh(shift)
        # CI's freshly-migrated DB has no users — create an ephemeral author.
        author = User(username="zzz-test-reporter", display_name="ZZZ Reporter",
                      role="admin", active=True)
        db.add(author)
        await db.commit()
        await db.refresh(author)
        inc = Incident(shift_id=shift.id, incident_type="sitter",
                       location_ref="ZZZTEST-ROOM", description="zzz report incident",
                       status="archived", logged_by=author.id)
        db.add(inc)
        from models.database import HandoffNote
        note = HandoffNote(shift_id=shift.id, note="zzz handoff line",
                           location_ref="ZZZTEST-ROOM", logged_by=author.id)
        db.add(note)
        await db.commit()
        await db.refresh(inc)
        await db.refresh(note)
        yield shift, inc, note
        from models.database import HandoffNote as HN
        await db.execute(delete(Incident).where(Incident.id == inc.id))
        await db.execute(delete(HN).where(HN.id == note.id))
        await db.execute(delete(Shift).where(Shift.id == shift.id))
        await db.execute(delete(User).where(User.id == author.id))
        await db.commit()
        await engine.dispose()


class TestShiftReportEndpoint:

    async def test_officer_forbidden(self):
        async with await _as("officer") as c:
            r = await c.get("/api/reports/shift?date=2026-09-17&code=DAY")
            assert r.status_code == 403

    async def test_lead_gets_report_json(self, shift_with_data):
        shift, inc, note = shift_with_data
        async with await _as("lead") as c:
            r = await c.get("/api/reports/shift?date=2026-09-17&code=DAY")
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["shift"]["code"] == "DAY"
            assert body["stats"]["total"] == 1
            assert body["stats"]["by_type"] == {"sitter": 1}
            # v2: per-officer breakdown keyed by display_name of logged_by
            assert body["stats"]["by_officer"] == [
                {"author": "ZZZ Reporter", "total": 1, "by_type": {"sitter": 1}}
            ]
            assert body["incidents"][0]["author"] == "ZZZ Reporter"
            assert body["incidents"][0]["id"] == inc.id
            assert body["handoff_notes"][0]["note"] == "zzz handoff line"

    async def test_admin_gets_report_too(self, shift_with_data):
        async with await _as("admin") as c:
            r = await c.get("/api/reports/shift?date=2026-09-17&code=DAY")
            assert r.status_code == 200

    async def test_unknown_shift_is_404(self):
        async with await _as("lead") as c:
            r = await c.get("/api/reports/shift?date=2099-01-16&code=EVE")
            assert r.status_code == 404
            assert "shift" in r.json()["detail"].lower()

    async def test_bad_date_or_code_is_422(self):
        async with await _as("lead") as c:
            assert (await c.get("/api/reports/shift?date=notadate&code=DAY")).status_code == 422
            assert (await c.get("/api/reports/shift?date=2099-01-15&code=mid")).status_code == 422

    async def test_pdf_returns_pdf_bytes(self, shift_with_data):
        async with await _as("lead") as c:
            r = await c.get("/api/reports/shift?date=2026-09-17&code=DAY&format=pdf")
            assert r.status_code == 200
            assert r.headers["content-type"].startswith("application/pdf")
            assert r.content[:5] == b"%PDF-"
            assert b"attachment" in r.headers["content-disposition"].encode()
            # day shift + date appear in the extracted PDF text
            assert b"DAY" in r.content

    async def test_default_returns_most_recently_ended(self, shift_with_data):
        shift, _, _ = shift_with_data
        # 2026-09-17 is past + latest-ended (dev seed tops out 2026-09-16; CI table empty)
        async with await _as("lead") as c:
            r = await c.get("/api/reports/shift")
            assert r.status_code == 200
            assert r.json()["shift"]["date"] == "2026-09-17"
            assert r.json()["shift"]["code"] == "DAY"


class TestExportCsvGate:

    async def test_export_csv_now_requires_lead(self):
        async with await _as("officer") as c:
            from routes.analytics import router as analytics_router
            app = make_app()
            app.include_router(analytics_router, prefix="/api/incidents")
            # rebuild client against the app that has analytics mounted
            async def override():
                return SimpleNamespace(id=1, username="zzz-officer", display_name="o",
                                       role="officer", active=True)
            from dependencies import get_current_user as gcu
            app.dependency_overrides[gcu] = override
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test",
                headers={"Authorization": f"Bearer {token_for('officer')}"},
            ) as c2:
                r = await c2.get("/api/incidents/export.csv")
                assert r.status_code == 403

    async def test_export_csv_lead_ok(self):
        from routes.analytics import router as analytics_router
        app = make_app()
        app.include_router(analytics_router, prefix="/api/incidents")

        async def override():
            return SimpleNamespace(id=1, username="zzz-lead", display_name="l",
                                   role="lead", active=True)
        from dependencies import get_current_user as gcu
        app.dependency_overrides[gcu] = override
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test",
            headers={"Authorization": f"Bearer {token_for('lead')}"},
        ) as c:
            r = await c.get("/api/incidents/export.csv")
            assert r.status_code == 200
            assert r.text.startswith("id,incident_type,")
