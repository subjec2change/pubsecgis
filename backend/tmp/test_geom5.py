import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"

async def test():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        # Get geom as raw bytes (EWKB hex)
        result = await conn.execute(text(
            "SELECT id, geom, geom::bytea::text FROM incidents WHERE id IN (1, 2)"
        ))
        for row in result:
            geom_raw = row[1]
            geom_bytea = row[2]
            print(f"\n=== Incident #{row[0]} ===")
            print(f"geom type: {type(geom_raw)}")
            print(f"geom value: {repr(geom_raw)}")
            print(f"geom bytea: {repr(geom_bytea)}")
            
            if isinstance(geom_raw, str) and len(geom_raw) == 48:
                print("Attempting hex EWKB parse...")
                from shapely import wkb
                from shapely.geometry import Point as ShpPoint
                try:
                    point = wkb.loads(bytes.fromhex(geom_raw))
                    print(f"Success! Point: {point}")
                    print(f"lat={point.y}, lng={point.x}")
                except Exception as e:
                    print(f"Parse error: {e}")
            
            # Also try ST_AsText
            result2 = await conn.execute(text(
                "SELECT ST_AsText(geom::geometry), ST_X(geom::geometry), ST_Y(geom::geometry) FROM incidents WHERE id = " + str(row[0])
            ))
            row2 = result2.fetchone()
            if row2:
                print(f"ST_AsText: {row2[0]}")
                print(f"ST_X: {row2[1]}, ST_Y: {row2[2]}")

    await engine.dispose()

asyncio.run(test())
