import asyncio
import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine
from models.database import Incident

DATABASE_URL = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"

async def test():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        # Test ORM loading
        stmt = select(Incident).where(Incident.id == 1)
        result = await conn.execute(stmt)
        incident = result.scalar_one()
        
        geom = incident.geom
        print(f"=== ORM-loaded geom (incident #1) ===")
        print(f"type: {type(geom)}")
        print(f"class name: {geom.__class__.__name__}")
        print(f"module: {geom.__class__.__module__}")
        print(f"repr: {repr(geom)[:200]}")
        print(f"str: {str(geom)}")
        
        # Check all attributes
        print("\n=== All non-private attributes ===")
        for attr in sorted(dir(geom)):
            if not attr.startswith('_'):
                try:
                    val = getattr(geom, attr)
                    if not callable(val):
                        print(f"  {attr}: {repr(val)[:100]}")
                except Exception as e:
                    print(f"  {attr}: ERROR {e}")
        
        # Check element
        if hasattr(geom, 'element'):
            elem = geom.element
            print(f"\n=== geom.element ===")
            print(f"type: {type(elem)}")
            print(f"repr: {repr(elem)[:100]}")
            if hasattr(elem, 'wkt'):
                print(f"element.wkt: {repr(elem.wkt)}")
        
        # Check impl
        if hasattr(geom, 'impl'):
            impl = geom.impl
            print(f"\n=== geom.impl ===")
            print(f"type: {type(impl)}")
            print(f"repr: {repr(impl)[:100]}")
            if hasattr(impl, 'wkt'):
                print(f"impl.wkt: {repr(impl.wkt)}")

    await engine.dispose()

asyncio.run(test())
