#!/usr/bin/env python3
"""Debug geom parsing from ORM-loaded incident."""
import os
import sys

# Ensure we're in the backend directory with models on the path
# __file__ is in tmp/, but models is in the parent
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
        stmt = select(Incident).where(Incident.id == 1)
        result = await conn.execute(stmt)
        incident = result.scalar_one()
        
        geom = incident.geom
        print(f"=== ORM-loaded geom (incident #1) ===")
        print(f"type: {type(geom)}")
        print(f"class: {geom.__class__.__name__}")
        print(f"module: {geom.__class__.__module__}")
        print(f"repr[:200]: {repr(geom)[:200]}")
        print(f"str: {str(geom)[:200]}")
        print(f"is str: {isinstance(geom, str)}")
        print(f"is bytes: {isinstance(geom, bytes)}")
        print(f"len (if str): {len(geom) if isinstance(geom, str) else 'N/A'}")
        
        # Check all attributes
        attrs_to_show = []
        for attr in sorted(dir(geom)):
            if not attr.startswith('_'):
                try:
                    val = getattr(geom, attr)
                    if not callable(val):
                        attrs_to_show.append(f"{attr}: {repr(val)[:100]}")
                except:
                    pass
        print(f"\n=== All non-callable attributes ===")
        for a in attrs_to_show:
            print(f"  {a}")
        
        # Check element specifically
        if hasattr(geom, 'element'):
            print(f"\n=== geom.element ===")
            elem = geom.element
            print(f"type: {type(elem)}")
            print(f"repr[:100]: {repr(elem)[:100]}")
            if hasattr(elem, 'wkt'):
                print(f"element.wkt: {repr(elem.wkt)}")
        
        # Check impl
        if hasattr(geom, 'impl'):
            print(f"\n=== geom.impl ===")
            impl = geom.impl
            print(f"type: {type(impl)}")
            print(f"repr[:100]: {repr(impl)[:100]}")
            if hasattr(impl, 'wkt'):
                print(f"impl.wkt: {repr(impl.wkt)}")

    await engine.dispose()

asyncio.run(test())
