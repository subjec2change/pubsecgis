#!/usr/bin/env python3
"""Seed the PUSECGIS database with initial user data."""
import asyncio
import bcrypt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"

async def seed():
    engine = create_async_engine(DATABASE_URL, echo=False)
    
    password = "pusecgis_dev"
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    
    users_to_insert = [
        ("admin.bjs",      "BJS Administrator",        "admin",      hashed),
        ("dispatch.hub",   "Dispatch Hub Lead",        "dispatch",   hashed),
        ("officer.murphy", "Officer Murphy",             "officer",    hashed),
        ("officer.chen",   "Officer Chen",               "officer",    hashed),
        ("lead.williams",  "Lead Williams",              "lead",       hashed),
    ]
    
    async with engine.begin() as conn:
        result = await conn.execute(text("SELECT COUNT(*) FROM users;"))
        count_before = result.scalar()
        print(f"Users before: {count_before}")
        
        for username, display_name, role, pw_hash in users_to_insert:
            await conn.execute(text("""
                INSERT INTO users (username, display_name, role, password_hash, active)
                VALUES (:username, :display_name, :role, :password_hash, TRUE)
                ON CONFLICT (username) DO UPDATE
                SET display_name = :display_name, role = :role, password_hash = :password_hash
            """), {
                "username": username,
                "display_name": display_name,
                "role": role,
                "password_hash": pw_hash,
            })
            print(f"  ✓ {username}")
        
        result = await conn.execute(text("SELECT COUNT(*) FROM users;"))
        print(f"Users after: {result.scalar()}")
    
    await engine.dispose()
    print("\n✅ Seed complete")

asyncio.run(seed())
