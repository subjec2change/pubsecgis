from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import Location


async def search_locations(db: AsyncSession, q: str = "") -> list[Location]:
    stmt = select(Location)

    if q:
        q_pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                Location.name.ilike(q_pattern),
                Location.building.ilike(q_pattern),
                Location.floor.ilike(q_pattern),
                Location.room_or_area.ilike(q_pattern),
            )
        )

    stmt = stmt.order_by(Location.name).limit(50)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_all_locations(db: AsyncSession) -> list[Location]:
    stmt = select(Location).order_by(Location.name)
    result = await db.execute(stmt)
    return list(result.scalars().all())
