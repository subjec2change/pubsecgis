from fastapi import APIRouter, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_session
from models.schemas import LocationResponse
from crud.locations import search_locations, get_all_locations

router = APIRouter()


@router.get("", response_model=list[LocationResponse])
async def list_locations(
    q: str | None = Query(None, description="Search query for location autocomplete"),
    db: AsyncSession = Depends(get_session),
):
    """Search locations. Supports autocomplete via q parameter."""
    if q:
        locations = await search_locations(db, q=q)
    else:
        locations = await get_all_locations(db)
    return locations
