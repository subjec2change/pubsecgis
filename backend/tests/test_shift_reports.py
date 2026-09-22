"""Shift Report assembly + endpoints (lead/admin only).

Pure assembly (crud/reports.py) is tested here first; HTTP routes (routes/
reports.py) are exercised through a mini FastAPI app with the real routers
because auth gates live in FastAPI Depends wiring — direct function calls
would bypass them entirely (unlike the floorplan tests' direct-call seam).
"""
from datetime import date, datetime, time, timedelta, timezone as tz

import pytest

from crud.reports import build_shift_report, most_recently_ended


def _shift(id=1, d=date(2026, 9, 16), code="DAY", start=time(6, 30), end=time(15, 0)):
    return SimpleShift(id, d, code, start, end)


class SimpleShift:
    def __init__(self, id, shift_date, shift_code, start_time, end_time):
        self.id = id
        self.shift_date = shift_date
        self.shift_code = shift_code
        self.start_time = start_time
        self.end_time = end_time


class SimpleIncident:
    def __init__(self, id, created_at, incident_type="victim_of_violence",
                 location_ref="MAIN-LOBBY", status="open",
                 response_phase="on_scene", description="desc"):
        self.id = id
        self.created_at = created_at
        self.incident_type = incident_type
        self.location_ref = location_ref
        self.status = status
        self.response_phase = response_phase
        self.description = description


class SimpleUser:
    def __init__(self, display_name):
        self.display_name = display_name


class SimpleNote:
    def __init__(self, id, note, created_at, author="Officer Chen"):
        self.id = id
        self.note = note
        self.created_at = created_at
        self.logged_by_user = SimpleUser(author)


def _cdt(y, m, d, hh, mm, ss=0):
    """America/Chicago wall time -> aware datetime (CDT, UTC-5, Sept)."""
    return datetime(y, m, d, hh, mm, ss, tzinfo=tz(timedelta(hours=-5)))


# ──────────────────────────────────────────────
# Assembly: stats, timeline, membership
# ──────────────────────────────────────────────

class TestBuildShiftReport:

    def test_day_shift_timeline_buckets_are_calendar_hours_06_to_14(self):
        """DAY 06:30-15:00 -> twelve buckets 06:00..14:00, empty hours present."""
        r = build_shift_report(
            _shift(), [], [],
            now=_cdt(2026, 9, 16, 23, 59), timezone="America/Chicago",
        )
        labels = [b["label"] for b in r["timeline"]]
        assert labels == [f"{h:02d}:00" for h in range(6, 15)]

    def test_evening_shift_timeline_buckets_are_14_to_22(self):
        r = build_shift_report(
            _shift(code="EVE", start=time(14, 30), end=time(23, 0)), [], [],
            now=_cdt(2026, 9, 16, 23, 59), timezone="America/Chicago",
        )
        labels = [b["label"] for b in r["timeline"]]
        assert labels == [f"{h:02d}:00" for h in range(14, 23)]

    def test_incidents_bucketed_by_local_hour(self):
        """A 09:15 CDT incident lands in the 09:00 bucket, not UTC 14:00."""
        inc = SimpleIncident(1, _cdt(2026, 9, 16, 9, 15))
        r = build_shift_report(
            _shift(), [inc], [],
            now=_cdt(2026, 9, 16, 23, 59), timezone="America/Chicago",
        )
        bucket = next(b for b in r["timeline"] if b["label"] == "09:00")
        assert bucket["count"] == 1
        assert all(b["count"] == 0 for b in r["timeline"] if b["label"] != "09:00")

    def test_timeline_counts_sum_to_total(self):
        """Every incident is in exactly one bucket (out-of-span clamped)."""
        incs = [
            SimpleIncident(1, _cdt(2026, 9, 16, 9, 15)),
            SimpleIncident(2, _cdt(2026, 9, 16, 11, 5)),
            SimpleIncident(3, _cdt(2026, 9, 16, 3, 0)),   # before span -> clamp first
            SimpleIncident(4, _cdt(2026, 9, 16, 20, 0)),  # after span  -> clamp last
        ]
        r = build_shift_report(
            _shift(), incs, [],
            now=_cdt(2026, 9, 16, 23, 59), timezone="America/Chicago",
        )
        assert sum(b["count"] for b in r["timeline"]) == r["stats"]["total"] == 4
        assert r["timeline"][0]["count"] == 1    # clamped early
        assert r["timeline"][-1]["count"] == 1   # clamped late

    def test_by_type_totals(self):
        incs = [
            SimpleIncident(1, _cdt(2026, 9, 16, 9, 0), incident_type="victim_of_violence"),
            SimpleIncident(2, _cdt(2026, 9, 16, 9, 30), incident_type="sitter"),
            SimpleIncident(3, _cdt(2026, 9, 16, 10, 0), incident_type="victim_of_violence"),
        ]
        r = build_shift_report(
            _shift(), incs, [],
            now=_cdt(2026, 9, 16, 23, 59), timezone="America/Chicago",
        )
        assert r["stats"]["by_type"] == {"victim_of_violence": 2, "sitter": 1}
        assert r["stats"]["total"] == 3

    def test_archived_incidents_are_included(self):
        """FK membership is canonical; archival is lifecycle, not relevance."""
        inc = SimpleIncident(1, _cdt(2026, 9, 16, 9, 15), status="archived")
        r = build_shift_report(
            _shift(), [inc], [],
            now=_cdt(2026, 9, 16, 23, 59), timezone="America/Chicago",
        )
        assert r["stats"]["total"] == 1
        assert r["incidents"][0]["id"] == 1

    def test_incident_row_columns(self):
        inc = SimpleIncident(7, _cdt(2026, 9, 16, 9, 15), description="full text")
        r = build_shift_report(
            _shift(), [inc], [],
            now=_cdt(2026, 9, 16, 23, 59), timezone="America/Chicago",
        )
        row = r["incidents"][0]
        assert set(row) == {
            "id", "created_at", "incident_type", "location_ref",
            "status", "response_phase", "description", "author",
            }
        assert row["created_at"].startswith("2026-09-16T09:15")

    def test_handoff_notes_verbatim_with_author_and_time(self):
        notes = [SimpleNote(1, "  Elevator stalled 3rd flr.  ", _cdt(2026, 9, 16, 14, 45))]
        r = build_shift_report(
            _shift(), [], notes,
            now=_cdt(2026, 9, 16, 23, 59), timezone="America/Chicago",
        )
        n = r["handoff_notes"][0]
        assert n["note"] == "  Elevator stalled 3rd flr.  "
        assert n["author"] == "Officer Chen"
        assert n["created_at"].startswith("2026-09-16T14:45")

    def test_shift_header_and_in_progress_flag(self):
        shift = _shift()
        ended = build_shift_report(shift, [], [], now=_cdt(2026, 9, 16, 16, 0), timezone="America/Chicago")
        live = build_shift_report(shift, [], [], now=_cdt(2026, 9, 16, 9, 0), timezone="America/Chicago")
        assert ended["shift"]["in_progress"] is False
        assert live["shift"]["in_progress"] is True
        assert ended["shift"] == {
            "id": 1, "date": "2026-09-16", "code": "DAY",
            "start_time": "06:30", "end_time": "15:00", "in_progress": False,
        }


# ──────────────────────────────────────────────
# most_recently_ended
# ──────────────────────────────────────────────

class TestMostRecentlyEnded:

    def test_picks_latest_ended_shift(self):
        shifts = [
            _shift(id=1, d=date(2026, 9, 15)),
            _shift(id=2, d=date(2026, 9, 16)),
            _shift(id=3, d=date(2026, 9, 16), code="EVE", start=time(14, 30), end=time(23, 0)),
        ]
        # 2026-09-16 16:00 CDT: DAY ended at 15:00, EVE still live
        pick = most_recently_ended(shifts, now=_cdt(2026, 9, 16, 16, 0), timezone="America/Chicago")
        assert pick.id == 2

    def test_falls_back_to_latest_when_none_ended(self):
        shifts = [
            _shift(id=1, d=date(2026, 9, 15)),
            _shift(id=2, d=date(2026, 9, 16)),
        ]
        pick = most_recently_ended(shifts, now=_cdt(2026, 9, 16, 5, 0), timezone="America/Chicago")
        assert pick.id == 1

    def test_empty_returns_none(self):
        assert most_recently_ended([], now=_cdt(2026, 9, 16, 16, 0), timezone="America/Chicago") is None


class TestEnumSerialization:
    def test_enum_status_serializes_to_plain_value(self):
        """Regression: str(IncidentStatus.OPEN) yields 'IncidentStatus.OPEN' —
        the report payload and PDF must carry the plain 'open' value."""
        import enum as _enum

        class IncidentStatus(_enum.Enum):
            OPEN = "open"

        inc = SimpleIncident(1, _cdt(2026, 9, 16, 9, 15))
        inc.status = IncidentStatus.OPEN
        rpt = build_shift_report(
            _shift(), [inc], [],
            now=_cdt(2026, 9, 16, 23, 59), timezone="America/Chicago",
        )
        assert rpt["incidents"][0]["status"] == "open"


# ──────────────────────────────────────────────
# v2: per-officer breakdown
# ──────────────────────────────────────────────

class SimpleIncident2(SimpleIncident):
    def __init__(self, id, created_at, author=None, **kw):
        super().__init__(id, created_at, **kw)
        self.logged_by_user = SimpleUser(author) if author else None


def _rpt(incidents):
    return build_shift_report(
        _shift(), incidents, [],
        now=_cdt(2026, 9, 16, 23, 59), timezone="America/Chicago",
    )


class TestPerOfficerBreakdown:
    def test_by_officer_totals_and_types(self):
        r = _rpt([
            SimpleIncident2(1, _cdt(2026, 9, 16, 7, 5), author="Officer Chen"),
            SimpleIncident2(2, _cdt(2026, 9, 16, 8, 5), author="Officer Chen",
                            incident_type="sitter"),
            SimpleIncident2(3, _cdt(2026, 9, 16, 9, 5), author="Officer Murphy"),
        ])
        bo = r["stats"]["by_officer"]
        assert len(bo) == 2
        chen = next(o for o in bo if o["author"] == "Officer Chen")
        murphy = next(o for o in bo if o["author"] == "Officer Murphy")
        assert chen["total"] == 2 and chen["by_type"] == {"victim_of_violence": 1, "sitter": 1}
        assert murphy["total"] == 1

    def test_officers_sorted_by_total_desc_then_name(self):
        r = _rpt([
            SimpleIncident2(1, _cdt(2026, 9, 16, 7, 5), author="Zoe"),
            SimpleIncident2(2, _cdt(2026, 9, 16, 7, 6), author="Adam"),
            SimpleIncident2(3, _cdt(2026, 9, 16, 7, 7), author="Adam"),
            SimpleIncident2(4, _cdt(2026, 9, 16, 7, 8), author="Adam"),
        ])
        authors = [o["author"] for o in r["stats"]["by_officer"]]
        assert authors == ["Adam", "Zoe"]

    def test_missing_author_lands_in_unknown(self):
        r = _rpt([SimpleIncident2(1, _cdt(2026, 9, 16, 7, 5), author=None)])
        bo = r["stats"]["by_officer"]
        assert bo == [{"author": "Unknown", "total": 1,
                       "by_type": {"victim_of_violence": 1}}]

    def test_incident_rows_carry_author(self):
        r = _rpt([SimpleIncident2(1, _cdt(2026, 9, 16, 7, 5), author="Officer Chen")])
        assert r["incidents"][0]["author"] == "Officer Chen"

    def test_by_officer_sums_to_total(self):
        r = _rpt([
            SimpleIncident2(i, _cdt(2026, 9, 16, 7, i), author=f"O{i % 2}")
            for i in range(1, 8)
        ])
        assert sum(o["total"] for o in r["stats"]["by_officer"]) == r["stats"]["total"] == 7


class TestPdfCarriesBreakdown:
    def test_pdf_renders_with_by_officer(self):
        """Shared payload means the PDF must survive (and lay out) v2 stats."""
        import zlib
        from reports.pdf import render_shift_report_pdf

        r = _rpt([
            SimpleIncident2(1, _cdt(2026, 9, 16, 7, 5), author="Officer Chen"),
            SimpleIncident2(2, _cdt(2026, 9, 16, 8, 5), author="Officer Murphy"),
        ])
        pdf = render_shift_report_pdf(r)
        assert pdf[:5] == b"%PDF-"
        # reportlab writes page streams as ASCII85(Flate(content)) by
        # default — peel both layers before searching for text.
        import base64
        import re as _re

        text = b""
        for m in _re.finditer(rb"stream\r?\n", pdf):
            j = pdf.find(b"endstream", m.end())
            blob = pdf[m.end():j].strip(b"\r\n")
            try:
                raw = zlib.decompress(blob)
            except zlib.error:
                try:
                    raw = zlib.decompress(base64.a85decode(blob, adobe=True))
                except Exception:
                    continue
            text += raw
        assert b"By officer" in text
        assert b"Officer Chen" in text and b"Officer Murphy" in text
