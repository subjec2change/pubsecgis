from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_session
from models.schemas import UserResponse
from crud.users import get_users

router = APIRouter()


@router.get("", response_model=list[UserResponse])
async def list_users(db: AsyncSession = Depends(get_session)):
    """List all active users. No auth required."""
    users = await get_users(db, active_only=True)
    return users
