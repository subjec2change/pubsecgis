from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, time
from typing import Optional

from models.database import get_session, Shift
from models.schemas import ShiftResponse
from dependencies import get_current_user

router = APIRouter()


@router.get("", response_model=list[ShiftResponse])
async def list_shifts(
    date_param: Optional[str] = Query(None, alias="date"),
    db: AsyncSession = Depends(get_session),
):
    """List shifts, optionally filtered by date."""
    stmt = select(Shift).order_by(Shift.shift_date.desc(), Shift.id)
    if date_param:
        try:
            stmt = stmt.where(Shift.shift_date == date.fromisoformat(date_param))
        except (ValueError, TypeError):
            pass
    result = await db.execute(stmt)
    shifts = list(result.scalars().all())
    return [ShiftResponse.from_shift(s) for s in shifts]


@router.post("", response_model=ShiftResponse, status_code=201)
async def create_or_get_shift(
    shift_code: str = Query(...),
    shift_date: str = Query(...),
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get or create a shift by code and date (idempotent)."""
    d = date.fromisoformat(shift_date)
    code = shift_code.upper()

    # Check if it exists
    stmt = select(Shift).where(Shift.shift_date == d, Shift.shift_code == code)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        await db.refresh(existing)
        return ShiftResponse.from_shift(existing)

    # Time windows
    times = {
        "DAY": (time(6, 30), time(15, 0)),
        "EVE": (time(14, 30), time(23, 0)),
        "NIGHT": (time(22, 30), time(7, 0)),
    }
    if code not in times:
        raise HTTPException(status_code=400, detail=f"Invalid shift code: {code}")

    start_t, end_t = times[code]
    shift = Shift(shift_date=d, shift_code=code, start_time=start_t, end_time=end_t)
    db.add(shift)
    await db.commit()
    await db.refresh(shift)
    return ShiftResponse.from_shift(shift)
