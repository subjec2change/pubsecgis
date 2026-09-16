import asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"

async def test():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        from models.database import Incident
        
        # Test ORM loading
        stmt = select(Incident).where(Incident.id == 1)
        result = await conn.execute(stmt)
        incident = result.scalar_one()
        
        geom = incident.geom
        print(f"=== ORM-loaded geom (incident #1) ===")
        print(f"type: {type(geom)}")
        print(f"class name: {geom.__class__.__name__}")
        print(f"module: {geom.__class__.__module__}")
        print(f"repr: {repr(geom)}")
        print(f"str: {str(geom)}")
        print(f"hex: {geom.hex if hasattr(geom, 'hex') else 'NO HEX'}")
        
        # Check all attributes that might contain coordinates
        print("\n=== All non-private attributes ===")
        for attr in sorted(dir(geom)):
            if not attr.startswith('_'):
                try:
                    val = getattr(geom, attr)
                    if not callable(val):
                        print(f"  {attr}: {repr(val)[:80]}")
                except Exception as e:
                    print(f"  {attr}: ERROR {e}")
        
        # Try the element attribute
        if hasattr(geom, 'element'):
            elem = geom.element
            print(f"\n=== geom.element ===")
            print(f"type: {type(elem)}")
            print(f"repr: {repr(elem)[:100]}")
            
            # Check the element for WKT
            if hasattr(elem, 'wkt'):
                print(f"element.wkt: {elem.wkt}")
        
        # Check implementation
        if hasattr(geom, 'impl'):
            impl = geom.impl
            print(f"\n=== geom.impl ===")
            print(f"type: {type(impl)}")
            print(f"repr: {repr(impl)[:100]}")
            if hasattr(impl, 'wkt'):
                print(f"impl.wkt: {impl.wkt}")
        
        # Check if we can get the raw database value
        print("\n=== Raw DB value via text() ===")
        result2 = await conn.execute(text(
            "SELECT id, geom, geom::bytea FROM incidents WHERE id = 1"
        ))
        row = result2.fetchone()
        print(f"geom column: {type(row[1])} - {repr(row[1])[:100]}")
        print(f"geom bytea: {type(row[2])} - {repr(row[2])[:100]}")

    await engine.dispose()

asyncio.run(test())
