import asyncio
import json
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"

async def test():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        from models.database import Incident
        stmt = select(Incident).options(Incident.__mapper__.get_column_result('geom')).where(Incident.id == 1)
        result = await conn.execute(stmt)
        incident = result.scalar_one()
        
        print(f"Incident ID: {incident.id}")
        geom = incident.geom
        print(f"geom type: {type(geom)}")
        print(f"geom class name: {geom.__class__.__name__}")
        print(f"geom module: {geom.__class__.__module__}")
        print(f"geom str repr: {str(geom)[:200]}")
        print(f"geom repr: {repr(geom)[:200]}")
        
        # Check all attributes
        attrs_to_check = ['wkt', 'hex', 'element', 'has_index', 'impl']
        for attr in attrs_to_check:
            if hasattr(geom, attr):
                try:
                    val = getattr(geom, attr)
                    print(f"  geom.{attr} = {repr(val)[:100]}")
                except Exception as e:
                    print(f"  geom.{attr} -> ERROR: {e}")
        
        # Check _tuple
        if hasattr(geom, '_tuple'):
            print(f"  geom._tuple = {geom._tuple}")
        
        # Check dir for anything useful
        for attr in dir(geom):
            if not attr.startswith('_') and 'wkt' in attr.lower() or 'hex' in attr.lower() or 'text' in attr.lower():
                try:
                    val = getattr(geom, attr)
                    if not callable(val):
                        print(f"  geom.{attr} = {repr(val)[:100]}")
                except:
                    pass
        
        # Try to access via column
        print(f"\n--- Direct DB query ---")
        result = await conn.execute(text(
            "SELECT geom, ST_AsText(geom::geometry), geom::text FROM incidents WHERE id = 1"
        ))
        row = result.fetchone()
        print(f"geom raw: {type(row[0])} - {repr(row[0])[:100]}")
        print(f"ST_AsText: {row[1]}")
        print(f"geom::text: {row[2]}")
            
    await engine.dispose()

asyncio.run(test())
