from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.database import get_session, Floorplan, FloorplanVersion
from models.schemas import FloorplanResponse, FloorplanCreate
from dependencies import require_role

router = APIRouter()


@router.get("", response_model=list[FloorplanResponse])
async def list_floorplans(
    q: str | None = Query(None, description="Free-text search over campus/building/floor"),
    building_id: str | None = Query(None),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_session),
):
    """Floor-plan sheet registry for the map overlay picker."""
    stmt = select(Floorplan).options(selectinload(Floorplan.versions))
    if not include_inactive:
        stmt = stmt.where(Floorplan.active.is_(True))
    if building_id:
        stmt = stmt.where(Floorplan.building_id == building_id)
    if q and q.strip():
        # All tokens must match somewhere in campus+building+floor
        # ("parkview 8" -> building like %parkview% AND floor like %8%).
        # Tokens are literal: LIKE metacharacters are escaped so '%'/'_'
        # in a search term match themselves, not wildcards.
        combined = func.concat_ws(
            " ", Floorplan.campus, Floorplan.building, Floorplan.floor_name
        )
        for token in q.split():
            literal = (
                token.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
            )
            stmt = stmt.where(combined.ilike(f"%{literal}%", escape="\\"))
    stmt = stmt.order_by(Floorplan.campus, Floorplan.building, Floorplan.id)
    rows = (await db.execute(stmt)).scalars().all()
    return [FloorplanResponse.from_orm_floorplan(r) for r in rows]


@router.post(
    "",
    response_model=FloorplanResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("admin"))],
)
async def create_floorplan(
    payload: FloorplanCreate,
    db: AsyncSession = Depends(get_session),
):
    """Register a floor-plan sheet (admin). The image itself must already be
    present under the served /floorplans/ static directory."""
    exists = (
        await db.execute(select(Floorplan).where(Floorplan.floor_id == payload.floor_id))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail=f"floor_id '{payload.floor_id}' already exists")
    if payload.south >= payload.north or payload.west >= payload.east:
        raise HTTPException(status_code=422, detail="bounds must be south<north and west<east")
    fp = Floorplan(**payload.model_dump())
    db.add(fp)
    await db.flush()
    version = FloorplanVersion(
        floorplan_id=fp.id, version=1, campus=fp.campus, building=fp.building,
        building_id=fp.building_id, floor_name=fp.floor_name, image=fp.image,
        south=fp.south, west=fp.west, north=fp.north, east=fp.east,
        rotation=fp.rotation,
    )
    db.add(version)
    await db.flush()
    fp.current_version_id = version.id
    await db.commit()
    await db.refresh(fp)
    return FloorplanResponse.from_orm_floorplan(fp)


@router.delete(
    "/{floor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role("admin"))],
)
async def delete_floorplan(floor_id: str, db: AsyncSession = Depends(get_session)):
    """Remove a sheet from the registry (admin). Does not delete the image file."""
    fp = (
        await db.execute(select(Floorplan).where(Floorplan.floor_id == floor_id))
    ).scalar_one_or_none()
    if fp is None:
        raise HTTPException(status_code=404, detail="floorplan not found")
    await db.delete(fp)
    await db.commit()
