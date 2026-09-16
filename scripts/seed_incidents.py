#!/usr/bin/env python3
"""Seed the PUSECGIS database with realistic test data:
  - A valid shift in the shifts table
  - Locations around Barnes-Jewish Hospital campus
  - 25 incidents with varied incident_type, status, and timestamps
  - Some incidents with updated_at > 24 h ago (to test auto-archive)
  - PostGIS POINT(geom) data for local area (38.647, -90.257)
"""

import asyncio
import random
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from geoalchemy2 import Geography, WKTElement
from geoalchemy2.shape import to_shape, from_shape
import shapely

# ── Config ──────────────────────────────────────────────────────────────
DATABASE_URL = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"

# Barnes-Jewish Hospital campus bounds (~0.002 deg ≈ 200 m)
LAT_MIN, LAT_MAX = 38.6458, 38.6490
LON_MIN, LON_MAX = -90.2590, -90.2560

# ── Data ────────────────────────────────────────────────────────────────
INCIDENT_TYPES = [
    "victim_of_violence",
    "problematic_patient",
    "agitated_visitor",
    "patient_with_sitter",
    "elopment_patient",
]

STATUSES = ["open", "monitoring", "escalating", "resolved"]

LOCATION_DEFS = [
    ("Main Public Safety Control", "Barnes-Jewish Hospital", "Lobby",
     "Public Safety Control Room", 38.647263, -90.257642),
    ("Adult ED Desk", "Barnes-Jewish Hospital", "1",
     "Emergency Department", 38.647180, -90.257800),
    ("Children's ED Desk", "Children's Hospital", "1",
     "Emergency Department", 38.648100, -90.256400),
    ("Building 3 — Main Entrance", "Barnes-Jewish Hospital", "1",
     "Main Lobby / Entrance", 38.647500, -90.257300),
    ("Building 3 — Floor A", "Barnes-Jewish Hospital", "2",
     "Near Nurse Station A", 38.647550, -90.257350),
    ("Parking Garage B — Level 1", "Barnes-Jewish Hospital", "G",
     "Parking Garage B, Level 1", 38.646500, -90.258100),
    ("Cafeteria — Main Floor", "Barnes-Jewish Hospital", "1",
     "Main Cafeteria", 38.646900, -90.257000),
    ("Pharmacy — Main Building", "Barnes-Jewish Hospital", "2",
     "Central Pharmacy", 38.647400, -90.257500),
    ("Helipad", "Barnes-Jewish Hospital", "Roof",
     "Helipad Zone A", 38.646200, -90.258500),
    ("Main Parking Lot", "Barnes-Jewish Hospital", "1",
     "Visitor Parking Lot C", 38.646000, -90.257200),
]

DESCRIPTION_TEMPLATES = [
    "Reported loud noises near {location_ref}",
    "Patient exhibiting unusual behavior, requires monitoring",
    "Family member requesting information about patient status",
    "Unattended bag reported in {location_ref}",
    "Patient attempting to leave against medical advice",
    "Visitor asking about visiting hours and policies",
    "Staff reported a patient becoming agitated",
    "Suspicious activity observed in parking area near {location_ref}",
    "Patient wandered from room, last seen heading toward {location_ref}",
    "Dispute between visitors in waiting area at {location_ref}",
    "Patient refused medication, becoming increasingly agitated",
    "Security camera outage reported near {location_ref}",
    "Family disagreement escalated near {location_ref}",
    "Patient with history of elopement attempting to exit",
    "Medical emergency reported, officer dispatched to {location_ref}",
    "Loitering reported outside {location_ref}",
    "Patient attempting to access restricted area near {location_ref}",
    "Noise complaint from patient room on upper floor",
    "Visitor attempting to enter staff-only area",
    "Lost child reported near {location_ref}",
]

RESPONSE_PHASES = [
    "en_route", "situational_awareness", "on_scene",
    "dps_intervention", "situation_stabilized",
    "pending_followup", "report_completed",
]


# ── Helpers ─────────────────────────────────────────────────────────────
def random_point() -> str:
    """Return a WKT POINT string with coordinates inside the campus bounds."""
    lat = round(random.uniform(LAT_MIN, LAT_MAX), 6)
    lon = round(random.uniform(LON_MIN, LON_MAX), 6)
    return f"POINT({lon} {lat})"


def random_timestamp_ago(hours_min: float, hours_max: float) -> datetime:
    """Return a datetime in the past between hours_min and hours_max ago."""
    offset_hours = random.uniform(hours_min, hours_max)
    return datetime.now(timezone.utc) - timedelta(hours=offset_hours)


# ── Async seed function ─────────────────────────────────────────────────
async def seed():
    engine = create_async_engine(DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        # ── 1. Create / fetch a valid shift ──────────────────────────────
        result = await conn.execute(
            text("""
                SELECT id FROM shifts
                WHERE shift_date = CURRENT_DATE AND shift_code = 'DAY'
                LIMIT 1
            """)
        )
        row = result.first()
        if row:
            shift_id = row[0]
            print(f"  Using existing shift id={shift_id}")
        else:
            # Insert a new DAY shift for today
            result = await conn.execute(text("""
                INSERT INTO shifts (shift_date, shift_code, start_time, end_time)
                VALUES (CURRENT_DATE, 'DAY', '06:00:00', '14:00:00')
                RETURNING id
            """))
            shift_id = result.scalar_one()
            print(f"  Created shift id={shift_id}")

        # ── 1b. Insert locations if none exist ───────────────────────────
        result = await conn.execute(text("SELECT COUNT(*) FROM locations;"))
        loc_count = result.scalar_one()
        if loc_count == 0:
            for name, building, floor, room, lat, lon in LOCATION_DEFS:
                wkt = f"POINT({lon} {lat})"
                await conn.execute(text("""
                    INSERT INTO locations (name, building, floor, room_or_area, latitude, longitude, geom)
                    VALUES (:name, :building, :floor, :room, :lat, :lon, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography)
                """), {
                    "name": name, "building": building,
                    "floor": floor, "room": room,
                    "lat": lat, "lon": lon,
                })
            print(f"  Created {len(LOCATION_DEFS)} locations")

        # ── 2. Fetch logged_by user id (admin.bjs) ──────────────────────
        result = await conn.execute(
            text("SELECT id FROM users WHERE username = 'admin.bjs' LIMIT 1;")
        )
        logged_by = result.scalar_one()
        print(f"  Logged by user id={logged_by}")

        # ── 3. Create 25 incidents ──────────────────────────────────────
        num_incidents = 25
        locations_map = {
            "Main Public Safety Control": "PS Control Room",
            "Adult ED Desk": "Adult ED",
            "Children's ED Desk": "Children's ED",
            "Building 3 — Main Entrance": "Building 3 Entrance",
            "Building 3 — Floor A": "Building 3 Floor 2",
            "Parking Garage B — Level 1": "Garage B",
            "Cafeteria — Main Floor": "Cafeteria",
            "Pharmacy — Main Building": "Main Pharmacy",
            "Helipad": "Helipad Zone A",
            "Main Parking Lot": "Parking Lot C",
        }

        incidents_created = 0
        for i in range(num_incidents):
            incident_type = random.choice(INCIDENT_TYPES)
            # Weight statuses: more open/monitoring, fewer escalated
            status = random.choices(STATUSES, weights=[4, 3, 2, 1], k=1)[0]
            location_ref = random.choice(LOCATION_DEFS)[0]
            description = random.choice(DESCRIPTION_TEMPLATES).format(
                location_ref=locations_map.get(location_ref, location_ref)
            )
            geom_wkt = random_point()
            location_short = locations_map.get(location_ref, location_ref)

            # updated_at: 30% chance >24h ago to test auto-archive
            if random.random() < 0.30:
                updated_at = random_timestamp_ago(25, 72)  # 25-72 hours ago
                archived_at = None  # not yet archived — let that be tested
            else:
                updated_at = random_timestamp_ago(0.1, 24)  # within last day
                archived_at = None

            created_at = updated_at - timedelta(minutes=random.randint(10, 120))

            # response_phase
            if status == "resolved":
                response_phase = "report_completed"
            elif status == "escalating":
                response_phase = random.choice(["dps_intervention", "situation_stabilized", "pending_followup"])
            else:
                response_phase = random.choice(RESPONSE_PHASES)

            # Determine if archived (resolved incidents older than 24h)
            if status == "resolved" and random.random() < 0.5:
                archived_at = updated_at

            await conn.execute(text("""
                INSERT INTO incidents (
                    shift_id, incident_type, location_ref, geom,
                    description, status, response_phase,
                    logged_by, created_at, updated_at, archived_at
                ) VALUES (
                    :shift_id, :incident_type, :location_ref,
                    ST_SetSRID(ST_MakePoint(:lon_pt, :lat_pt), 4326)::geography,
                    :description, :status, :response_phase,
                    :logged_by, :created_at, :updated_at, :archived_at
                )
            """), {
                "shift_id": shift_id,
                "incident_type": incident_type,
                "location_ref": location_short,
                "lon_pt": float(to_shape(geom_wkt).x),
                "lat_pt": float(to_shape(geom_wkt).y),
                "description": description,
                "status": status,
                "response_phase": response_phase,
                "logged_by": logged_by,
                "created_at": created_at.isoformat(),
                "updated_at": updated_at.isoformat(),
                "archived_at": archived_at.isoformat() if archived_at else None,
            })
            incidents_created += 1

        print(f"  Created {incidents_created} incidents")

        # ── 4. Create a few handoff notes ──────────────────────────────
        for i in range(5):
            note_text = random.choice([
                "Shift change notes: monitor adult ED for any follow-ups",
                "Parking garage B has a camera blind spot near exit",
                "Children's ED requires additional security overnight",
                "Main lobby foot traffic is high this week",
                "Staff reported a suspicious person near the helipad access",
            ])
            await conn.execute(text("""
                INSERT INTO handoff_notes (shift_id, location_ref, note, logged_by, created_at)
                VALUES (:shift_id, :location_ref, :note, :logged_by, NOW())
            """), {
                "shift_id": shift_id,
                "location_ref": random.choice(list(locations_map.values())),
                "note": note_text,
                "logged_by": logged_by,
            })
        print("  Created 5 handoff notes")

    await engine.dispose()

    # ── Verification ──────────────────────────────────────────────────
    engine2 = create_async_engine(DATABASE_URL, echo=False)
    async with engine2.begin() as conn:
        result = await conn.execute(text("SELECT COUNT(*) FROM incidents;"))
        total = result.scalar_one()
        result = await conn.execute(text("SELECT COUNT(*) FROM incidents WHERE archived_at IS NOT NULL;"))
        archived = result.scalar_one()
        result = await conn.execute(text("SELECT status, COUNT(*) FROM incidents GROUP BY status ORDER BY status;"))
        by_status = {row[0]: row[1] for row in result}
        result = await conn.execute(text("SELECT incident_type, COUNT(*) FROM incidents GROUP BY incident_type ORDER BY incident_type;"))
        by_type = {row[0]: row[1] for row in result}

    print(f"\n  Total incidents: {total}")
    print(f"  Archived: {archived}")
    print(f"  By status: {by_status}")
    print(f"  By type: {by_type}")
    print("\n  Seed complete ✓")
    return total


if __name__ == "__main__":
    count = asyncio.run(seed())
    print(f"\nSeeded {count} incidents successfully.")
