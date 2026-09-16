#!/usr/bin/env python3
"""Debug what the ORM actually returns for geom."""
import sys, os

# Get the parent directory (where models lives)
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
        # Use scalar_one() which is correct for a single-row query
        stmt = select(Incident).where(Incident.id == 1)
        result = await conn.execute(stmt)
        
        # Check what result returns
        incidents_list = result.scalars().all()
        print(f"=== result.scalars().all() ===")
        print(f"len: {len(incidents_list)}")
        if incidents_list:
            incident = incidents_list[0]
            print(f"type(incident): {type(incident)}")
            print(f"incident.id: {incident.id}")
            geom = incident.geom
            print(f"type(geom): {type(geom)}")
            print(f"geom class: {geom.__class__.__name__}")
            print(f"geom module: {geom.__class__.__module__}")
            print(f"repr(geom)[:200]: {repr(geom)[:200]}")
            print(f"str(geom)[:200]: {str(geom)[:200]}")
            print(f"isinstance(geom, str): {isinstance(geom, str)}")
            print(f"len(geom) if str: {len(geom) if isinstance(geom, str) else 'N/A'}")
            
            # Check all attributes
            print(f"\n=== All attributes ===")
            for attr in sorted(dir(geom)):
                if not attr.startswith('_'):
                    try:
                        val = getattr(geom, attr)
                        if not callable(val):
                            print(f"  {attr}: {repr(val)[:60]}")
                    except:
                        print(f"  {attr}: <error>")
            
            # Check .element
            if hasattr(geom, 'element'):
                elem = geom.element
                print(f"\n=== geom.element ===")
                print(f"type: {type(elem)}")
                print(f"repr: {repr(elem)[:200]}")
                if hasattr(elem, 'wkt'):
                    print(f"element.wkt: {repr(elem.wkt)}")
            
            # Check .impl
            if hasattr(geom, 'impl'):
                impl = geom.impl
                print(f"\n=== geom.impl ===")
                print(f"type: {type(impl)}")
                print(f"repr: {repr(impl)[:200]}")
                if hasattr(impl, 'wkt'):
                    print(f"impl.wkt: {repr(impl.wkt)}")
        else:
            print("No incidents found")
        
        # Also try raw SQL to confirm geom data exists
        result2 = await conn.execute(text("SELECT id, geom, geom::bytea::hex FROM incidents WHERE id = 1"))
        row = result2.fetchone()
        if row:
            print(f"\n=== Raw DB geom for id=1 ===")
            print(f"geom column type: {type(row[1])}")
            print(f"geom column value: {repr(row[1])[:200]}")
            print(f"geom bytea hex: {repr(row[2])[:200] if row[2] else 'None'}")

    await engine.dispose()

asyncio.run(test())
