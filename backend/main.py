from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
import asyncio

from config import settings


async def auto_archive_loop():
    """Background task: auto-archive resolved incidents every 30 minutes."""
    from models.database import async_session
    from crud.incidents import archive_expired_incidents
    while True:
        await asyncio.sleep(1800)  # 30 minutes
        try:
            async with async_session() as session:
                count = await archive_expired_incidents(session)
                if count:
                    print(f"[auto-archive] Archived {count} resolved incident(s)")
        except Exception as e:
            print(f"[auto-archive] Error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: verify DB on startup, start auto-archive, clean up on shutdown."""
    from models.database import engine
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        print("Database connection verified")
    # Start auto-archive background task
    asyncio.create_task(auto_archive_loop())
    yield
    await engine.dispose()
    print("Backend shutting down")


app = FastAPI(
    title="PUSECGIS API",
    description="Public Safety Common Operating Picture for BJC Healthcare",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers
from routes.auth import router as auth_router
from routes.incidents import router as incidents_router
from routes.broadcast import router as broadcast_router
from routes.handoff import router as handoff_router
from routes.locations import router as locations_router
from routes.users import router as users_router
from routes.shifts import router as shifts_router

app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(incidents_router, prefix="/api/incidents", tags=["Incidents"])
app.include_router(broadcast_router, prefix="/api/broadcast", tags=["Broadcast"])
app.include_router(handoff_router, prefix="/api/handoff", tags=["Handoff Notes"])
app.include_router(locations_router, prefix="/api/locations", tags=["Locations"])
app.include_router(users_router, prefix="/api/users", tags=["Users"])
app.include_router(shifts_router, prefix="/api/shifts", tags=["Shifts"])
