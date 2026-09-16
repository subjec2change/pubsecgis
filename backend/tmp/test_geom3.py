import asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"

async def test():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        # Fetch the actual geom object via ORM
        result = await conn.execute(text("SELECT * FROM incidents WHERE id = 1"))
        row = result.fetchone()
        if row:
            geom = row[8]  # geom is column index 8 in the full SELECT *
            print(f"geom type: {type(geom)}")
            print(f"geom class name: {geom.__class__.__name__}")
            print(f"geom module: {geom.__class__.__module__}")
            print(f"geom str repr: {str(geom)[:200]}")
            print(f"geom repr: {repr(geom)[:200]}")
            print(f"geom is str: {isinstance(geom, str)}")
            print(f"geom is bytes: {isinstance(geom, bytes)}")
            if isinstance(geom, str):
                print(f"geom length: {len(geom)}")
            # Check for wkt attribute
            print(f"has wkt attr: {hasattr(geom, 'wkt')}")
            if hasattr(geom, 'wkt'):
                print(f"geom.wkt: {repr(geom.wkt)}")
            else:
                print("NO wkt attribute found")
                print(f"geom attributes: {[a for a in dir(geom) if not a.startswith('_')]}")
            
            # Try ST_AsText via raw SQL
            result2 = await conn.execute(text("SELECT ST_AsText(geom::geometry) FROM incidents WHERE id = 1"))
            wkt_result = result2.scalar()
            print(f"\nST_AsText(geom::geometry): {wkt_result}")
            
    await engine.dispose()

asyncio.run(test())
