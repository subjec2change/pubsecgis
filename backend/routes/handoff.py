from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_session, HandoffNote, User
from models.schemas import HandoffNoteCreate, HandoffNoteResponse
from crud.handoff import get_handoff_notes, create_handoff_note
from dependencies import get_current_user

router = APIRouter()


@router.get("/notes", response_model=list[HandoffNoteResponse])
async def list_handoff_notes(
    shift: int | None = Query(None),
    date: str | None = Query(None),
    db: AsyncSession = Depends(get_session),
):
    """List handoff notes with optional filters."""
    notes = await get_handoff_notes(db, shift=shift, date=date)
    # Use dict conversion only — avoid accessing ORM relationships which trigger lazy-load
    result = []
    for n in notes:
        result.append({
            "id": n.id,
            "shift_id": n.shift_id,
            "location_ref": n.location_ref,
            "note": n.note,
            "logged_by": n.logged_by,
            "created_at": n.created_at,
        })
    return result


@router.post("/notes", response_model=HandoffNoteResponse, status_code=201)
async def create_handoff_note_route(
    note_data: HandoffNoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Create a handoff note (requires authentication)."""
    note = await create_handoff_note(
        db,
        shift_id=note_data.shift_id,
        note=note_data.note,
        logged_by_id=current_user.id,
        location_ref=note_data.location_ref,
    )
    await db.refresh(note)
    return note
