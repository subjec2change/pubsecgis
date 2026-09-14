from sqlalchemy import select, func, cast
from sqlalchemy.dialects.postgresql import ENUM as PGEnum
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime, timedelta, timezone

from models.database import Incident, User, Shift, IncidentStatus


def _cast_to_status(val):
    """Cast a plain Python string to the PostgreSQL incident_status enum type."""
    return cast(val, PGEnum("incident_status", name="incident_status", create_type=False))


async def archive_expired_incidents(db: AsyncSession) -> int:
    """Auto-archive incidents that have been in 'resolved' status for 24+ hours.
    Returns the number of incidents archived."""
    cutoff = func.now() - timedelta(hours=24)
    result = await db.execute(
        select(Incident).where(
            Incident.status == _cast_to_status(IncidentStatus.RESOLVED.value),
            Incident.updated_at < cutoff,
            Incident.archived_at.is_(None),
        )
    )
    to_archive = result.scalars().all()
    for inc in to_archive:
        inc.status = _cast_to_status(IncidentStatus.ARCHIVED.value)
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
        # Silently skip — the background auto-archive loop handles retries.
        # Do NOT let auto-archive failures crash the route handler.
        pass

    stmt = (
        select(Incident)
        .options(joinedload(Incident.logged_by_user))
    )

    # Exclude archived by default
    if not include_archived:
        stmt = stmt.where(Incident.status != _cast_to_status(IncidentStatus.ARCHIVED.value))

    if status_filter:
        stmt = stmt.where(Incident.status == _cast_to_status(status_filter))
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


async def create_incident(
    db: AsyncSession,
    incident_type: str,
    location_ref: str,
    shift_id: int,
    description: str,
    logged_by_id: int,
    status: str = "open",
    response_phase: Optional[str] = None,
) -> Incident:
    incident = Incident(
        incident_type=incident_type,
        location_ref=location_ref,
        shift_id=shift_id,
        description=description or "",
        logged_by=logged_by_id,
        status=_cast_to_status(status),
        response_phase=response_phase or None,
    )
    db.add(incident)
    await db.flush()
    await db.commit()
    return incident


async def update_incident(
    db: AsyncSession,
    incident_id: int,
    incident_type: Optional[str] = None,
    location_ref: Optional[str] = None,
    description: Optional[str] = None,
    status: Optional[str] = None,
    response_phase: Optional[str] = None,
) -> Optional[Incident]:
    result = await db.execute(select(Incident).where(Incident.id == incident_id).options(joinedload(Incident.logged_by_user)))
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
            incident.status = _cast_to_status(status)
    if response_phase is not None:
        incident.response_phase = response_phase or None

    await db.flush()
    await db.commit()
    return incident


async def delete_incident(db: AsyncSession, incident_id: int) -> bool:
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        return False
    await db.delete(incident)
    await db.flush()
    await db.commit()
    return True
