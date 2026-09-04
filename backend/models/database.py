from sqlalchemy import (
    Column, BigInteger, String, Text,
    Boolean, Date, Time, DateTime, func,
    ForeignKey, Integer, Numeric, Enum as SAEnum,
    Text as TextType,
)
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from geoalchemy2 import Geography
import enum

from config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def get_session():
    async with async_session() as session:
        yield session


class IncidentStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED = "resolved"
    MONITORING = "monitoring"
    ARCHIVED = "archived"


class User(Base):
    __tablename__ = "users"
    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    username = Column(String(80), unique=True, nullable=False)
    display_name = Column(String(120), nullable=False)
    role = Column(String(20), nullable=False, default="officer")
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    incidents_logged = relationship("Incident", back_populates="logged_by_user")
    handoff_notes_logged = relationship("HandoffNote", back_populates="logged_by_user")


class Shift(Base):
    __tablename__ = "shifts"
    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    shift_date = Column(Date, nullable=False)
    shift_code = Column(String(10), nullable=False, default="DAY")
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    incidents = relationship("Incident", back_populates="shift")
    handoff_notes = relationship("HandoffNote", back_populates="shift")


class Location(Base):
    __tablename__ = "locations"
    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    building = Column(String(100))
    floor = Column(String(50))
    room_or_area = Column(String(100))
    latitude = Column(Numeric(10, 7))
    longitude = Column(Numeric(10, 7))
    geom = Column(Geography("POINT", srid=4326))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Incident(Base):
    __tablename__ = "incidents"
    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    shift_id = Column(BigInteger, ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False)
    incident_type = Column(String(40), nullable=False)
    location_ref = Column(String(300), nullable=False)
    geom = Column(Geography("POINT", srid=4326))
    description = Column(Text)
    status = Column(String(20), nullable=False, default="open")
    response_phase = Column(String(32), nullable=True)
    logged_by = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    archived_at = Column(DateTime(timezone=True), nullable=True)

    shift = relationship("Shift", back_populates="incidents")
    logged_by_user = relationship("User", back_populates="incidents_logged")


class HandoffNote(Base):
    __tablename__ = "handoff_notes"
    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    shift_id = Column(BigInteger, ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False)
    location_ref = Column(String(300))
    note = Column(Text, nullable=False)
    logged_by = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    shift = relationship("Shift", back_populates="handoff_notes")
    logged_by_user = relationship("User", back_populates="handoff_notes_logged")
