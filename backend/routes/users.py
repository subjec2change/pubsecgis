from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_session
from models.schemas import UserResponse
from crud.users import get_users
from dependencies import get_current_user

router = APIRouter()


@router.get("", response_model=list[UserResponse],
            dependencies=[Depends(get_current_user)])
async def list_users(db: AsyncSession = Depends(get_session)):
    """List all active users. Requires authentication — the directory
    exposes display names and roles."""
    users = await get_users(db, active_only=True)
    return users
