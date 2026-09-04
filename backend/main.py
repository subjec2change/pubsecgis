from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: verify DB on startup, clean up on shutdown."""
    from models.database import engine
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        print("Database connection verified")
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
