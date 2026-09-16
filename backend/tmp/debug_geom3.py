#!/usr/bin/env python3
"""Debug geom parsing from ORM-loaded incident."""
import os
import sys

# Ensure we're in the backend directory with models on the path
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(parent_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine
from models.database import Incident

DATABASE_URL = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"

async def test():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        # Use select with the full Incident model - this should work
        result = await conn.execute(select(Incident).where(Incident.id == 1))
        incident = result.scalar_one()
        
        print(f"=== ORM-loaded incident #1 ===")
        print(f"type(incident): {type(incident)}")
        print(f"incident.id: {incident.id}")
        print(f"incident.incident_type: {incident.incident_type}")
        
        geom = incident.geom
        print(f"\n=== geom ===")
        print(f"type(geom): {type(geom)}")
        print(f"class name: {geom.__class__.__name__}")
        print(f"module: {geom.__class__.__module__}")
        print(f"repr[:300]: {repr(geom)[:300]}")
        print(f"str(geom)[:300]: {str(geom)[:300]}")
        print(f"is str: {isinstance(geom, str)}")
        print(f"is bytes: {isinstance(geom, bytes)}")
        print(f"len (if str): {len(geom) if isinstance(geom, str) else 'N/A'}")
        print(f"hex (if str): {geom.hex if isinstance(geom, str) and len(geom) < 60 else 'N/A'}")
        
        # Check all attributes
        print(f"\n=== All non-callable attributes ===")
        attrs = [a for a in sorted(dir(geom)) if not a.startswith('_')]
        for attr in attrs:
            try:
                val = getattr(geom, attr)
                if not callable(val):
                    print(f"  {attr}: {repr(val)[:80]}")
            except Exception as e:
                print(f"  {attr}: ERROR {e}")
        
        # Check element specifically
        if hasattr(geom, 'element'):
            print(f"\n=== geom.element ===")
            elem = geom.element
            print(f"type: {type(elem)}")
            print(f"repr[:200]: {repr(elem)[:200]}")
            if hasattr(elem, 'wkt'):
                print(f"element.wkt: {repr(elem.wkt)}")
        
        # Check impl
        if hasattr(geom, 'impl'):
            print(f"\n=== geom.impl ===")
            impl = geom.impl
            print(f"type: {type(impl)}")
            print(f"repr[:200]: {repr(impl)[:200]}")
            if hasattr(impl, 'wkt'):
                print(f"impl.wkt: {repr(impl.wkt)}")

    await engine.dispose()

asyncio.run(test())
