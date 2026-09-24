from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from typing import Optional
from datetime import datetime, timedelta, timezone

from models.database import Incident, User, Shift, IncidentStatus, FloorplanVersion, Floorplan, IncidentFloorplanPinHistory


# ──────────────────────────────────────────────
# Coordinate resolution helper (Task 2)
# ──────────────────────────────────────────────


class CoordsResult:
    """Simple holder for resolved latitude and longitude."""
    def __init__(self, latitude: Optional[float], longitude: Optional[float]):
        self.latitude = latitude
        self.longitude = longitude


def resolve_location_coords(
    location_ref: str,
    known_locations: list,
    explicit_lat: Optional[float] = None,
    explicit_lng: Optional[float] = None,
) -> CoordsResult:
    """Resolve coordinates for an incident.

    Priority:
    1. Known location from the database (matches location_ref).
    2. Explicit latitude/longitude passed from the map click.
    3. Neither → both return None.
    """
    # 1. Try known location first
    for loc in known_locations:
        if loc.name == location_ref or loc.room_or_area == location_ref:
            if loc.latitude is not None and loc.longitude is not None:
                return CoordsResult(
                    latitude=float(loc.latitude),
                    longitude=float(loc.longitude),
                )

    # 2. Fall back to explicit coords
    if explicit_lat is not None and explicit_lng is not None:
        return CoordsResult(latitude=explicit_lat, longitude=explicit_lng)

    # 3. Nothing available
    return CoordsResult(latitude=None, longitude=None)


async def archive_expired_incidents(db: AsyncSession) -> int:
    """Auto-archive incidents that have been in 'resolved' status for 24+ hours.
    Returns the number of incidents archived."""
    cutoff = func.now() - timedelta(hours=24)
    result = await db.execute(
        select(Incident).where(
            Incident.status == IncidentStatus.RESOLVED.value,
            Incident.updated_at < cutoff,
            Incident.archived_at.is_(None),
        )
    )
    to_archive = result.scalars().all()
    for inc in to_archive:
        inc.status = IncidentStatus.ARCHIVED.value
        inc.archived_at = datetime.now(timezone.utc)
    if to_archive:
        await db.commit()
    return len(to_archive)


async def get_incidents(
    db: AsyncSession,
    status_filter: Optional[str] = None,
    incident_type: Optional[str] = None,
    date: Optional[str] = None,
    location: Optional[str] = None,
    shift: Optional[int] = None,
    include_archived: bool = False,
) -> list[Incident]:
    # Auto-archive any expired resolved incidents first
    try:
        await archive_expired_incidents(db)
    except Exception:
        pass

    # Use selectinload on logged_by_user so the relationship populates
    stmt = (
        select(Incident)
        .options(selectinload(Incident.logged_by_user), selectinload(Incident.floorplan_version).selectinload(FloorplanVersion.floorplan))
    )

    # Exclude archived by default
    if not include_archived:
        stmt = stmt.where(Incident.status != IncidentStatus.ARCHIVED.value)

    if status_filter:
        stmt = stmt.where(Incident.status == status_filter)
    if incident_type:
        stmt = stmt.where(Incident.incident_type == incident_type)
    if location:
        stmt = stmt.where(Incident.location_ref.ilike(f"%{location}%"))
    if date:
        try:
            from datetime import date as date_type
            stmt = stmt.where(func.cast(Incident.created_at, func.DATE) == date_type.fromisoformat(date))
        except (ValueError, TypeError):
            pass
    if shift:
        stmt = stmt.where(Incident.shift_id == shift)

    stmt = stmt.order_by(Incident.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def _get_active_floorplan_version(db: AsyncSession, version_id: int) -> FloorplanVersion:
    result = await db.execute(
        select(FloorplanVersion)
        .join(Floorplan, Floorplan.id == FloorplanVersion.floorplan_id)
        .where(FloorplanVersion.id == version_id, Floorplan.active.is_(True))
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise ValueError("active floorplan version not found")
    return version


async def create_incident(
    db: AsyncSession,
    incident_type: str,
    location_ref: str,
    shift_id: int,
    description: str,
    logged_by_id: int,
    status: str = "open",
    response_phase: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    floorplan_version_id: Optional[int] = None,
    floorplan_x: Optional[float] = None,
    floorplan_y: Optional[float] = None,
    room_label: Optional[str] = None,
    actor_id: Optional[int] = None,
) -> Incident:
    from geoalchemy2 import WKTElement

    geom = None
    if latitude is not None and longitude is not None:
        geom = WKTElement(
            f"POINT ({longitude} {latitude})",
            srid=4326,
        )

    incident = Incident(
        incident_type=incident_type,
        location_ref=location_ref,
        shift_id=shift_id,
        description=description or "",
        logged_by=logged_by_id,
        status=status,
        response_phase=response_phase or None,
        geom=geom,
        floorplan_version_id=floorplan_version_id,
        floorplan_x=floorplan_x,
        floorplan_y=floorplan_y,
        room_label=room_label,
    )
    db.add(incident)
    await db.flush()
    if floorplan_version_id is not None:
        if actor_id is None:
            raise ValueError("pin actor is required")
        await _get_active_floorplan_version(db, floorplan_version_id)
    if floorplan_version_id is not None and (floorplan_x is None or floorplan_y is None):
        raise ValueError("floorplan coordinates are required")
    await db.commit()
    result = await db.execute(
        select(Incident)
        .where(Incident.id == incident.id)
        .options(
            selectinload(Incident.logged_by_user),
            selectinload(Incident.floorplan_version).selectinload(FloorplanVersion.floorplan),
        )
    )
    return result.scalar_one()


async def update_incident(
    db: AsyncSession,
    incident_id: int,
    incident_type: Optional[str] = None,
    location_ref: Optional[str] = None,
    description: Optional[str] = None,
    status: Optional[str] = None,
    response_phase: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    floorplan_version_id: Optional[int] = None,
    floorplan_x: Optional[float] = None,
    floorplan_y: Optional[float] = None,
    room_label: Optional[str] = None,
    pin_reason: Optional[str] = None,
    actor_id: Optional[int] = None,
    pin_update: bool = False,
    pin_fields_set: Optional[set[str]] = None,
) -> Optional[Incident]:
    from geoalchemy2 import WKTElement

    result = await db.execute(
        select(Incident)
        .where(Incident.id == incident_id)
        .options(selectinload(Incident.logged_by_user), selectinload(Incident.floorplan_version).selectinload(FloorplanVersion.floorplan))
    )
    incident = result.scalar_one_or_none()
    if not incident:
        return None

    if incident_type:
        incident.incident_type = incident_type
    if location_ref:
        incident.location_ref = location_ref
    if description is not None:
        incident.description = description
    if status:
        valid_statuses = ["open", "resolved", "monitoring", "archived", "escalating"]
        if status in valid_statuses:
            incident.status = status
    if response_phase is not None:
        incident.response_phase = response_phase or None

    # Update coordinates if provided
    if latitude is not None and longitude is not None:
        incident.geom = WKTElement(
            f"POINT ({longitude} {latitude})",
            srid=4326,
        )

    if pin_update:
        fields = pin_fields_set or set()
        old_pin = (incident.floorplan_version_id, incident.floorplan_x, incident.floorplan_y, incident.room_label)
        if {"floorplan_version_id", "floorplan_x", "floorplan_y"} <= fields:
            next_version_id, next_x, next_y = floorplan_version_id, floorplan_x, floorplan_y
        elif {"floorplan_version_id", "floorplan_x", "floorplan_y"} & fields:
            raise ValueError("floorplan_version_id, floorplan_x, and floorplan_y must be supplied together")
        else:
            next_version_id, next_x, next_y = old_pin[:3]
        next_room = room_label if "room_label" in fields else old_pin[3]
        new_pin = (next_version_id, next_x, next_y, next_room)
        if next_version_id is not None:
            await _get_active_floorplan_version(db, next_version_id)
        if next_version_id is not None and (next_x is None or next_y is None):
            raise ValueError("floorplan coordinates are required")
        if actor_id is None:
            raise ValueError("pin actor is required")
        if old_pin != new_pin:
            if old_pin != (None, None, None, None) and not pin_reason:
                raise ValueError("pin changes require a reason")
            db.add(IncidentFloorplanPinHistory(incident_id=incident.id, floorplan_version_id=old_pin[0],
                floorplan_x=old_pin[1], floorplan_y=old_pin[2], room_label=old_pin[3],
                actor_id=actor_id, reason=pin_reason))
        incident.floorplan_version_id, incident.floorplan_x = next_version_id, next_x
        incident.floorplan_y, incident.room_label = next_y, next_room

    await db.flush()
    await db.commit()
    result = await db.execute(
        select(Incident)
        .where(Incident.id == incident.id)
        .options(
            selectinload(Incident.logged_by_user),
            selectinload(Incident.floorplan_version).selectinload(FloorplanVersion.floorplan),
        )
    )
    return result.scalar_one()


async def delete_incident(db: AsyncSession, incident_id: int) -> bool:
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        return False
    await db.delete(incident)
    await db.flush()
    await db.commit()
    return True
