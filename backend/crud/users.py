from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import User


async def get_users(db: AsyncSession, active_only: bool = True) -> list[User]:
    stmt = select(User).order_by(User.username)
    if active_only:
        stmt = stmt.where(User.active.is_(True))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()
