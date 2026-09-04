from fastapi import APIRouter, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import timedelta, datetime, timezone

from models.database import get_session, Incident
from models.schemas import BroadcastIncidentResponse, IncidentTypeConfig, INCIDENT_TYPE_MAP

router = APIRouter()


@router.get("/incidents", response_model=list[BroadcastIncidentResponse])
async def list_broadcast_incidents(
    hours: int = Query(2, description="Return incidents from the last N hours"),
    db: AsyncSession = Depends(get_session),
):
    """Public endpoint for broadcast screens - no auth required."""
    from sqlalchemy import select

    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
    result = await db.execute(
        select(Incident).where(
            Incident.created_at >= cutoff,
            Incident.status != "archived",
        ).order_by(Incident.created_at.desc())
    )
    incidents = list(result.scalars().all())

    response = []
    for inc in incidents:
        type_info = INCIDENT_TYPE_MAP.get(inc.incident_type, {"color": "#808080", "label": inc.incident_type})
        response.append(BroadcastIncidentResponse(
            id=inc.id,
            incident_type=inc.incident_type,
            location_ref=inc.location_ref,
            description=inc.description,
            status=str(inc.status),
            created_at=inc.created_at,
            type_info=IncidentTypeConfig(
                type=inc.incident_type,
                color=type_info["color"],
                label=type_info["label"],
            ),
        ))

    return response


@router.get("/config", response_model=list[IncidentTypeConfig])
async def get_broadcast_config():
    """Public endpoint - returns incident type configuration with colors and labels."""
    return [
        IncidentTypeConfig(
            type=inc_type,
            color=config["color"],
            label=config["label"],
        )
        for inc_type, config in INCIDENT_TYPE_MAP.items()
    ]
