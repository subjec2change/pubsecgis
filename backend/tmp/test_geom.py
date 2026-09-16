import asyncio
import json
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

DATABASE_URL = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"

async def test():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        # Fetch raw geom values
        result = await conn.execute(text(
            "SELECT id, geom, geom::text, geom::geography::text, ST_AsText(geom::geometry) FROM incidents WHERE id = 1"
        ))
        row = result.fetchone()
        if row:
            print(f"ID: {row[0]}")
            print(f"geom type: {type(row[1])}")
            print(f"geom::text: {repr(row[2])}")
            print(f"geom::geography::text: {repr(row[3])}")
            print(f"ST_AsText(geom::geometry): {repr(row[4])}")

    await engine.dispose()

asyncio.run(test())
