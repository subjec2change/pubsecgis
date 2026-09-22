"""Shift Report assembly (pure; no HTTP, no DB).

The shift's clock windows (DAY 06:30-15:00, EVE 14:30-23:00) are hospital
local wall time (America/Chicago); incident timestamps are stored UTC. All
timeline/stats math happens in local time — see CONTEXT.md for the domain
definitions (Shift Report, Shift, Handoff Note).
"""
from datetime import date, datetime, time, timedelta
from typing import Iterable, Optional, Sequence
from zoneinfo import ZoneInfo

from models.database import Shift

DEFAULT_TIMEZONE = "America/Chicago"


def _zone(tzname: str) -> ZoneInfo:
    return ZoneInfo(tzname)


def shift_span(shift: Shift, tzname: str) -> tuple[datetime, datetime]:
    """Local-aware (start, end) datetimes for a shift row."""
    z = _zone(tzname)
    start = datetime.combine(shift.shift_date, shift.start_time, tzinfo=z)
    end = datetime.combine(shift.shift_date, shift.end_time, tzinfo=z)
    if end <= start:  # graveyard-style span crossing midnight
        end += timedelta(days=1)
    return start, end


def _hour_label(hour: int) -> str:
    return f"{hour:02d}:00"


def build_shift_report(
    shift: Shift,
    incidents: Sequence,
    handoff_notes: Sequence,
    now: datetime,
    timezone: str = DEFAULT_TIMEZONE,
) -> dict:
    """Assemble the Shift Report payload (preview + PDF share this).

    incidents/handoff_notes are the shift's rows (FK membership, archived
    included). Rows are plain ORM objects or any object with the same
    attributes (tests use fakes).
    """
    z = _zone(timezone)
    start, end = shift_span(shift, timezone)

    buckets: list[dict] = [
        {"label": _hour_label(h), "count": 0}
        for h in range(start.hour, end.hour + 1)
    ]
    # The final bucket covers up to (and including) the shift end; when the
    # shift ends exactly on the hour the trailing full-hour bucket is dropped
    # so DAY (06:30-15:00) yields 06:00..14:00, not a phantom 15:00 column.
    if end.minute == 0 and end.hour > start.hour:
        if buckets and buckets[-1]["label"] == _hour_label(end.hour):
            buckets.pop()

    by_type: dict[str, int] = {}
    incident_rows = []
    for inc in incidents:
        by_type[inc.incident_type] = by_type.get(inc.incident_type, 0) + 1
        local = inc.created_at.astimezone(z) if inc.created_at else start
        hour = local.hour
        first, last = start.hour, start.hour + len(buckets) - 1
        if hour < first:
            hour = first
        elif hour > last:
            hour = last
        buckets[hour - first]["count"] += 1
        incident_rows.append({
            "id": inc.id,
            "created_at": local.isoformat(timespec="seconds"),
            "incident_type": inc.incident_type,
            "location_ref": inc.location_ref,
            "status": inc.status.value if hasattr(inc.status, "value") else str(inc.status),
            "response_phase": inc.response_phase,
            "description": inc.description,
        })

    note_rows = []
    for n in handoff_notes:
        local = n.created_at.astimezone(z) if n.created_at else start
        note_rows.append({
            "id": n.id,
            "note": n.note,
            "author": n.logged_by_user.display_name if n.logged_by_user else None,
            "created_at": local.isoformat(timespec="seconds"),
        })
    note_rows.sort(key=lambda r: r["created_at"])
    incident_rows.sort(key=lambda r: r["created_at"])

    in_progress = start <= now.astimezone(z) <= end

    return {
        "shift": {
            "id": shift.id,
            "date": shift.shift_date.isoformat(),
            "code": shift.shift_code,
            "start_time": shift.start_time.strftime("%H:%M"),
            "end_time": shift.end_time.strftime("%H:%M"),
            "in_progress": in_progress,
        },
        "generated_at": now.astimezone(z).isoformat(timespec="seconds"),
        "stats": {"total": len(incident_rows), "by_type": by_type},
        "timeline": buckets,
        "incidents": incident_rows,
        "handoff_notes": note_rows,
    }


def most_recently_ended(shifts: Iterable[Shift], now: datetime,
                        timezone: str = DEFAULT_TIMEZONE) -> Optional[Shift]:
    """Latest shift whose span has ended (local time); if none ended yet,
    the latest shift by date (fallback so the UI always has a selection)."""
    z = _zone(timezone)
    now_local = now.astimezone(z)
    candidates = list(shifts)
    if not candidates:
        return None
    ended = [
        s for s in candidates
        if shift_span(s, timezone)[1] <= now_local
    ]
    pool = ended or candidates
    return max(pool, key=lambda s: (s.shift_date, s.end_time))
