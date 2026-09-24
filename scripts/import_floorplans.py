#!/usr/bin/env python3
"""Idempotent importer: floorplans.json (or a same-shape JSON) -> floorplans table.

Usage:
    cd backend && ./.venv/bin/python ../scripts/import_floorplans.py \
        [--json ../frontend/src/data/floorplans.json] [--campus "North Campus"] \
        [--rotation 10] [--dry-run]

Upserts by floor_id. Image paths stay as-is (expected to live under
frontend/public/floorplans/, served at /floorplans/ and /api/floorplans
is the registry API). Requires the DB reachable per backend/config.py.
"""
import argparse
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import selectinload
from models.database import async_session, Floorplan, FloorplanVersion  # noqa: E402


async def upsert(rows, dry_run=False):
    created = updated = skipped = 0
    async with async_session() as session:
        for r in rows:
            south, west = r["bounds"][0]
            north, east = r["bounds"][1]
            existing = (await session.execute(
                select(Floorplan).options(selectinload(Floorplan.versions)).where(Floorplan.floor_id == r["floor_id"])
            )).scalar_one_or_none()
            if existing:
                changed = (
                    existing.image != r["image"]
                    or float(existing.south) != south or float(existing.west) != west
                    or float(existing.north) != north or float(existing.east) != east
                    or existing.floor_name != r["floor_name"]
                    or float(existing.rotation or 0) != r["rotation"]
                )
                if changed:
                    next_version = max((v.version for v in existing.versions), default=0) + 1
                    version = FloorplanVersion(
                        floorplan_id=existing.id, version=next_version,
                        campus=r["campus"], building=r["building"], building_id=r["building_id"],
                        floor_name=r["floor_name"], image=r["image"], south=south, west=west,
                        north=north, east=east, rotation=r["rotation"],
                    )
                    session.add(version)
                    await session.flush()
                    existing.current_version_id = version.id
                    existing.image = r["image"]
                    existing.south, existing.west = south, west
                    existing.north, existing.east = north, east
                    existing.floor_name = r["floor_name"]
                    existing.rotation = r["rotation"]
                    existing.campus = r["campus"]
                    existing.building = r["building"]
                    existing.building_id = r["building_id"]
                    updated += 1
                    print(f"  update {r['floor_id']}")
                else:
                    skipped += 1
            else:
                new_floorplan = Floorplan(
                    floor_id=r["floor_id"], campus=r["campus"],
                    building=r["building"], building_id=r["building_id"],
                    floor_name=r["floor_name"], image=r["image"],
                    south=south, west=west, north=north, east=east,
                    rotation=r["rotation"],
                )
                session.add(new_floorplan)
                await session.flush()
                version = FloorplanVersion(
                    floorplan_id=new_floorplan.id, version=1,
                    campus=new_floorplan.campus, building=new_floorplan.building,
                    building_id=new_floorplan.building_id, floor_name=new_floorplan.floor_name,
                    image=new_floorplan.image, south=south, west=west, north=north,
                    east=east, rotation=new_floorplan.rotation,
                )
                session.add(version)
                await session.flush()
                new_floorplan.current_version_id = version.id
                created += 1
                print(f"  create {r['floor_id']}")
        if dry_run:
            await session.rollback()
            print("dry-run: rolled back")
        else:
            await session.commit()
    print(f"done: {created} created, {updated} updated, {skipped} unchanged")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default=os.path.join(
        os.path.dirname(__file__), "..", "frontend", "src", "data", "floorplans.json"))
    ap.add_argument("--campus", default="North Campus")
    ap.add_argument("--rotation", type=float, default=10.0,
                    help="clockwise tilt (deg) applied to these sheets on the map")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data = json.load(open(args.json))
    rows = []
    for b in data:
        for f in b["floors"]:
            rows.append({
                "floor_id": f["id"],
                "campus": args.campus,
                "building": b["building"],
                "building_id": b["buildingId"],
                "floor_name": f["name"],
                "image": f["image"],
                "bounds": f["bounds"],
                "rotation": args.rotation,
            })
    print(f"importing {len(rows)} sheets from {args.json}")
    asyncio.run(upsert(rows, args.dry_run))


if __name__ == "__main__":
    main()
