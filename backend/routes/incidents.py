from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_session, User
from models.schemas import (
    IncidentCreate, IncidentResponse, IncidentUpdate,
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
    return incidents


@router.post("", response_model=IncidentResponse, status_code=201)
async def create_incident_route(
    incident_data: IncidentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Create a new incident (requires authentication)."""
    incident = await create_incident(
        db,
        incident_type=incident_data.incident_type,
        location_ref=incident_data.location_ref,
        shift_id=incident_data.shift_id,
        description=incident_data.description or "",
        logged_by_id=current_user.id,
        status=incident_data.status,
        response_phase=incident_data.response_phase,
    )
    await db.refresh(incident)
    return incident


@router.put("/{incident_id}", response_model=IncidentResponse)
async def update_incident_route(
    incident_id: int,
    update_data: IncidentUpdate,
    current_user: User = Depends(require_role("lead", "admin")),
    db: AsyncSession = Depends(get_session),
):
    """Update an incident (requires lead or admin role)."""
    incident = await update_incident(
        db,
        incident_id,
        incident_type=update_data.incident_type,
        location_ref=update_data.location_ref,
        description=update_data.description,
        status=update_data.status,
        response_phase=update_data.response_phase,
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    await db.refresh(incident)
    return incident


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
