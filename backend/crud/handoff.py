from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from models.database import HandoffNote


async def get_handoff_notes(
    db: AsyncSession,
    shift: Optional[int] = None,
    date: Optional[str] = None,
) -> list[HandoffNote]:
    stmt = select(HandoffNote)

    if shift:
        stmt = stmt.where(HandoffNote.shift_id == shift)

    stmt = stmt.order_by(HandoffNote.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_handoff_note(
    db: AsyncSession,
    shift_id: int,
    note: str,
    logged_by_id: int,
    location_ref: Optional[str] = None,
) -> HandoffNote:
    handoff_note = HandoffNote(
        shift_id=shift_id,
        note=note,
        logged_by=logged_by_id,
        location_ref=location_ref,
    )
    db.add(handoff_note)
    await db.flush()
    await db.commit()
    return handoff_note
