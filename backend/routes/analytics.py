from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_session, Incident
from models.schemas import VALID_INCIDENT_TYPES

router = APIRouter()

# Severity multipliers for heatmap intensity weighting
_STATUS_SEVERITY = {
    "open": 3,
    "escalating": 2,
    "monitoring": 1,
    "resolved": 0,
    "archived": 0,
}

_VALID_EXPORT_STATUSES = {"open", "escalating", "monitoring", "resolved", "archived"}


def _intensity_for_status(status: str) -> int:
    """Return the severity weight for a given status."""
    return _STATUS_SEVERITY.get(status, 0)


@router.get("/heatmap")
async def heatmap(
    lat: float = Query(..., ge=-90, le=90, description="Latitude of the search center"),
    lng: float = Query(..., ge=-180, le=180, description="Longitude of the search center"),
    radius: int = Query(500, ge=1, description="Search radius in metres (default 500)"),
    limit: int = Query(200, ge=1, le=5000, description="Maximum points to return (default 200)"),
    db: AsyncSession = Depends(get_session),
):
    """Return heatmap data within a radius of a centre point.

    Each incident is mapped to {lat, lng, intensity} where intensity is
    the severity weight (open=3, escalating=2, monitoring=1, resolved/archived=0)
    multiplied by the count of incidents at that location.  Points are
    ordered by descending intensity and capped at *limit*.
    """
    # Use ST_DWithin to filter incidents within the search radius.
    # ST_X / ST_Y extract WGS84 coordinates from the PostGIS geography column.
    stmt = (
        select(
            Incident,
            func.st_y(Incident.geom).label("lat"),
            func.st_x(Incident.geom).label("lng"),
        )
        .where(
            func.st_dwithin(
                Incident.geom,
                func.st_makeline(
                    func.st_makepoint(lng, lat),
                    func.st_makepoint(lng, lat),
                ),
                radius,
                True,  # units in metres because geom is GEOGRAPHY
            ),
            Incident.status != "archived",
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    # Aggregate: group by (lat, lng) and sum intensity weights
    points: dict[tuple[float, float], float] = {}
    for row in rows:
        inc = row[0]
        row_lat = float(row.lat)
        row_lng = float(row.lng)
        intensity = _intensity_for_status(inc.status)
        key = (row_lat, row_lng)
        points[key] = points.get(key, 0.0) + intensity

    # Sort by descending intensity and return the top *limit*
    sorted_points = sorted(points.items(), key=lambda kv: kv[1], reverse=True)[:limit]

    return [
        {"lat": round(lat_, 6), "lng": round(lng_, 6), "intensity": round(int_, 2)}
        for (lat_, lng_), int_ in sorted_points
    ]


@router.get("/trends")
async def trends(
    period: str = Query("weekly", pattern="^(weekly|monthly)$", description="Grouping period"),
    start_date: str | None = Query(None, description="Start date YYYY-MM-DD"),
    end_date: str | None = Query(None, description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_session),
):
    """Return time-series incident counts grouped by week or month.

    Each bucket contains:
      - date_str: formatted date string (YYYY-Www or YYYY-MM)
      - count: total incidents in bucket
      - by_type: map of incident_type → count
    """
    if period == "weekly":
        date_part = func.to_char(Incident.created_at, "YYYY-Www")
        date_order = func.to_char(Incident.created_at, "IYYY-IW")
    else:
        date_part = func.to_char(Incident.created_at, "YYYY-MM")
        date_order = func.date_trunc("month", Incident.created_at)

    stmt = select(
        date_part.label("date_str"),
        func.count().label("count"),
        Incident.incident_type,
    ).where(Incident.status != "archived")

    if start_date:
        stmt = stmt.where(func.date(Incident.created_at) >= start_date)
    if end_date:
        stmt = stmt.where(func.date(Incident.created_at) <= end_date)

    stmt = stmt.group_by(date_part, Incident.incident_type).order_by(date_order)
    result = await db.execute(stmt)
    rows = result.all()

    # Aggregate into per-bucket dicts
    buckets: dict[str, dict] = {}
    for date_str, count, inc_type in rows:
        if date_str not in buckets:
            buckets[date_str] = {"date_str": date_str, "count": 0, "by_type": {}}
        buckets[date_str]["count"] += count
        buckets[date_str]["by_type"][inc_type] = buckets[date_str]["by_type"].get(inc_type, 0) + count

    # Return sorted by date
    return sorted(buckets.values(), key=lambda b: b["date_str"])


@router.get("/export.csv")
async def export_csv(
    status: str | None = Query(None, description="Filter by status"),
    start_date: str | None = Query(None, description="Filter start date YYYY-MM-DD"),
    end_date: str | None = Query(None, description="Filter end date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_session),
):
    """Export incidents as a CSV download.

    Columns: id, incident_type, location_ref, description, status,
    response_phase, created_at, logged_by
    """
    stmt = select(Incident).where(Incident.status != "archived")

    if status:
        if status not in _VALID_EXPORT_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}. Must be one of {sorted(_VALID_EXPORT_STATUSES)}")
        stmt = stmt.where(Incident.status == status)
    if start_date:
        stmt = stmt.where(func.date(Incident.created_at) >= start_date)
    if end_date:
        stmt = stmt.where(func.date(Incident.created_at) <= end_date)

    stmt = stmt.order_by(Incident.created_at.desc())
    result = await db.execute(stmt)
    incidents = result.scalars().all()

    # Build CSV string
    lines = ["id,incident_type,location_ref,description,status,response_phase,created_at,logged_by"]
    for inc in incidents:
        desc_val = str(inc.description or "")
        resp_val = str(inc.response_phase or "")
        created_val = str(inc.created_at.isoformat()) if inc.created_at is not None else ""
        fields = [
            str(inc.id),
            str(inc.incident_type),
            _csv_field(str(inc.location_ref)),
            _csv_field(desc_val),
            str(inc.status),
            _csv_field(resp_val),
            created_val,
            str(inc.logged_by),
        ]
        lines.append(",".join(fields))

    body = "\n".join(lines) + "\n"
    return Response(
        content=body,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="incidents.csv"'},
    )


def _csv_field(value: str) -> str:
    """Quote a CSV field if it contains commas, quotes, or newlines."""
    if any(c in value for c in (',', '"', '\n', '\r')):
        return '"' + value.replace('"', '""') + '"'
    return value
