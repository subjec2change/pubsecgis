"""Shift Report HTTP surface (lead/admin only).

GET /api/reports/shift?date=&code=       -> report JSON (preview)
GET /api/reports/shift?...&format=pdf    -> PDF download
No params                               -> most-recently-ended shift
"""
from datetime import date, datetime, timezone as tz

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from crud.reports import DEFAULT_TIMEZONE, build_shift_report, most_recently_ended
from dependencies import require_role
from models.database import HandoffNote, Incident, Shift, get_session
from reports.pdf import render_shift_report_pdf

router = APIRouter(dependencies=[Depends(require_role("lead", "admin"))])

_VALID_CODES = {"DAY", "EVE", "NIGHT"}


async def _load_report(db: AsyncSession, shift: Shift) -> dict:
    incidents = (
        await db.execute(
            select(Incident)
            .where(Incident.shift_id == shift.id)
            .options(selectinload(Incident.logged_by_user), selectinload(Incident.floorplan_version))
            .order_by(Incident.created_at)
        )
    ).scalars().all()
    notes = (
        await db.execute(
            select(HandoffNote)
            .where(HandoffNote.shift_id == shift.id)
            .options(selectinload(HandoffNote.logged_by_user))
            .order_by(HandoffNote.created_at)
        )
    ).scalars().all()
    return build_shift_report(
        shift, incidents, notes, now=datetime.now(tz.utc), timezone=DEFAULT_TIMEZONE
    )


@router.get("/shift")
async def get_shift_report(
    date_: date | None = Query(None, alias="date", description="YYYY-MM-DD"),
    code: str | None = Query(None, description="DAY | EVE | NIGHT"),
    format: str = Query("json", pattern="^(json|pdf)$"),
    db: AsyncSession = Depends(get_session),
):
    if date_ is None and code is None:
        shifts = (
            await db.execute(select(Shift).order_by(Shift.shift_date, Shift.id))
        ).scalars().all()
        shift = most_recently_ended(
            shifts, now=datetime.now(tz.utc), timezone=DEFAULT_TIMEZONE
        )
        if shift is None:
            raise HTTPException(status_code=404, detail="no shifts exist yet")
    elif date_ is None or code is None:
        raise HTTPException(
            status_code=422, detail="date and code must be provided together"
        )
    else:
        if code.upper() not in _VALID_CODES:
            raise HTTPException(
                status_code=422, detail=f"code must be one of {sorted(_VALID_CODES)}"
            )
        shift = (
            await db.execute(
                select(Shift).where(
                    Shift.shift_date == date_, Shift.shift_code == code.upper()
                )
            )
        ).scalar_one_or_none()
        if shift is None:
            raise HTTPException(
                status_code=404,
                detail=f"shift not found: {date_.isoformat()} {code.upper()}",
            )

    report = await _load_report(db, shift)

    if format == "pdf":
        pdf_bytes = render_shift_report_pdf(report)
        filename = f"shift_report_{report['shift']['date']}_{report['shift']['code']}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    return report
