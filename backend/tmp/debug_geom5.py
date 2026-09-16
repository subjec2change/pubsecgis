#!/usr/bin/env python3
"""Debug what the ORM returns and how to access geom."""
import sys, os

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

os.chdir(backend_dir)

import asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine
from models.database import Incident

DATABASE_URL = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"

async def test():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        # Try different approaches
        result = await conn.execute(select(Incident).where(Incident.id == 1))
        
        # Approach 1: result.all()
        print("=== result.all() ===")
        rows = result.all()
        print(f"type: {type(rows)}")
        print(f"len: {len(rows)}")
        if rows:
            row = rows[0]
            print(f"row type: {type(row)}")
            print(f"row[0] type: {type(row[0])}")
            print(f"row[0] is Incident: {isinstance(row[0], Incident)}")
            if isinstance(row[0], Incident):
                geom = row[0].geom
                print(f"geom type: {type(geom)}")
                print(f"geom repr: {repr(geom)[:200]}")
                print(f"is str: {isinstance(geom, str)}")
                if isinstance(geom, str):
                    print(f"len: {len(geom)}")
                    print(f"geom[:50]: {geom[:50]}")
        
        # Approach 2: Use raw query for geom comparison
        print("\n=== Raw geom comparison ===")
        result2 = await conn.execute(text(
            "SELECT id, geom, geom::bytea FROM incidents WHERE id IN (1, 2)"
        ))
        for row in result2:
            print(f"\nIncident {row[0]}:")
            print(f"  geom type: {type(row[1])}")
            print(f"  geom is str: {isinstance(row[1], str)}")
            print(f"  geom[:50]: {str(row[1])[:50] if row[1] else 'None'}")
            print(f"  bytea: {row[2]}")

    await engine.dispose()

asyncio.run(test())
