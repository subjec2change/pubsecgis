import asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"

async def test():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        from models.database import Incident
        
        stmt = select(Incident).where(Incident.id == 1)
        result = await conn.execute(stmt)
        incident = result.scalar_one()
        
        geom = incident.geom
        print(f"geom type: {type(geom)}")
        print(f"geom value: {repr(geom)}")
        print(f"geom is str: {isinstance(geom, str)}")
        
        if isinstance(geom, str):
            print(f"geom length: {len(geom)}")
            print(f"geom[:10]: {geom[:10]}")
            
            # Try the hex parsing logic from schemas.py
            if len(geom) == 48:
                print("Length is 48 — attempting hex parse...")
                from shapely import wkb
                from shapely.geometry import Point as ShpPoint
                try:
                    point = wkb.loads(bytes.fromhex(geom))
                    print(f"Parsed point: {point}")
                    print(f"Point type: {type(point)}")
                    if isinstance(point, ShpPoint) and not point.is_empty:
                        print(f"lat={point.y}, lng={point.x}")
                    else:
                        print("Not a ShpPoint or empty")
                except Exception as e:
                    print(f"Parse error: {e}")
            else:
                print(f"Length is {len(geom)}, not 48 — skipping hex parse")
                
                # Check if it's a different format
                print(f"geom repr: {repr(geom)}")
                # Try to see if it's a bytes object stored as string
                try:
                    print(f"Try as bytes: {bytes.fromhex(geom)}")
                except:
                    print("Not valid hex at all")
        
    await engine.dispose()

asyncio.run(test())
