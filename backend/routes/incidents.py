from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.database import get_session, User, Incident, IncidentFloorplanPinHistory
from models.schemas import (
    IncidentCreate, IncidentResponse, IncidentUpdate, IncidentFloorplanPinHistoryResponse,
    RESPONSE_PHASES, RESPONSE_PHASE_LABELS, ResponsePhaseConfig, GetResponsePhasesResponse,
)
from crud.incidents import get_incidents, create_incident, update_incident, delete_incident
from dependencies import get_current_user, require_role

router = APIRouter()


@router.get("", response_model=list[IncidentResponse])
async def list_incidents(
    status: str | None = Query(None),
    type: str | None = Query(None),
    date: str | None = Query(None),
    location: str | None = Query(None),
    shift: int | None = Query(None),
    include_archived: bool = Query(False, description="Include archived incidents"),
    db: AsyncSession = Depends(get_session),
):
    """List incidents with optional filters. Archived excluded by default."""
    incidents = await get_incidents(
        db,
        status_filter=status,
        incident_type=type,
        date=date,
        location=location,
        shift=shift,
        include_archived=include_archived,
    )
    return [IncidentResponse.from_incident(i) for i in incidents]


@router.post("", response_model=IncidentResponse, status_code=201)
async def create_incident_route(
    incident_data: IncidentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Create a new incident (requires authentication)."""
    try:
        incident = await create_incident(
            db,
            incident_type=incident_data.incident_type,
            location_ref=incident_data.location_ref,
            shift_id=incident_data.shift_id,
            description=incident_data.description or "",
            logged_by_id=current_user.id,
            status=incident_data.status or "open",
            response_phase=incident_data.response_phase,
            latitude=incident_data.latitude,
            longitude=incident_data.longitude,
            floorplan_version_id=incident_data.floorplan_version_id,
            floorplan_x=incident_data.floorplan_x,
            floorplan_y=incident_data.floorplan_y,
            room_label=incident_data.room_label,
            actor_id=current_user.id,
        )
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    await db.commit()
    return IncidentResponse.from_incident(incident)


@router.put("/{incident_id}", response_model=IncidentResponse)
async def update_incident_route(
    incident_id: int,
    update_data: IncidentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Update an incident (requires lead or admin role)."""
    existing = (await db.execute(select(Incident).where(Incident.id == incident_id))).scalar_one_or_none()
    if existing is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    if current_user.role not in ("lead", "admin") and (existing.logged_by != current_user.id or getattr(existing.status, "value", existing.status) == "resolved"):
        raise HTTPException(status_code=403, detail="Only the author may edit a non-resolved incident")
    if current_user.role in ("lead", "admin") and getattr(existing.status, "value", existing.status) == "resolved":
        if update_data.model_fields_set - {"pin_reason"} and not update_data.pin_reason:
            raise HTTPException(status_code=422, detail="corrections to resolved incidents require a reason")
    try:
        incident = await update_incident(
            db,
            incident_id,
            incident_type=update_data.incident_type,
            location_ref=update_data.location_ref,
            description=update_data.description,
            status=update_data.status,
            response_phase=update_data.response_phase,
            latitude=update_data.latitude,
            longitude=update_data.longitude,
            floorplan_version_id=update_data.floorplan_version_id,
            floorplan_x=update_data.floorplan_x,
            floorplan_y=update_data.floorplan_y,
            room_label=update_data.room_label,
            pin_reason=update_data.pin_reason,
            actor_id=current_user.id,
            pin_update=any(k in update_data.model_fields_set for k in ("floorplan_version_id", "floorplan_x", "floorplan_y", "room_label")),
            pin_fields_set=update_data.model_fields_set,
        )
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await db.commit()
    return IncidentResponse.from_incident(incident)


@router.delete("/{incident_id}", status_code=204)
async def delete_incident_route(
    incident_id: int,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_session),
):
    """Delete an incident (requires admin role)."""
    deleted = await delete_incident(db, incident_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Incident not found")
    return None


@router.get("/response-phases", response_model=GetResponsePhasesResponse)
async def get_response_phases():
    """Return the full list of available response phases and their display labels."""
    phases = [ResponsePhaseConfig(phase=phase, label=RESPONSE_PHASE_LABELS[phase]) for phase in RESPONSE_PHASES]
    return GetResponsePhasesResponse(phases=phases)


@router.get("/{incident_id}/floorplan-history", response_model=list[IncidentFloorplanPinHistoryResponse], dependencies=[Depends(require_role("lead", "admin"))])
async def floorplan_history(incident_id: int, db: AsyncSession = Depends(get_session)):
    rows = (await db.execute(select(IncidentFloorplanPinHistory).where(
        IncidentFloorplanPinHistory.incident_id == incident_id
    ).order_by(IncidentFloorplanPinHistory.created_at.desc()))).scalars().all()
    return rows
