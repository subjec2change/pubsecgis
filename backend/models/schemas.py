from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional
from datetime import date, datetime


class UserBase(BaseModel):
    username: str
    display_name: str
    role: str


class UserCreate(UserBase):
    password: str


class UserResponse(UserBase):
    id: int
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ShiftResponse(BaseModel):
    id: int
    shift_date: date
    shift_code: str
    start_time: str
    end_time: str
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_shift(cls, shift):
        return cls(
            id=shift.id,
            shift_date=shift.shift_date,
            shift_code=shift.shift_code,
            start_time=shift.start_time.isoformat() if shift.start_time else "",
            end_time=shift.end_time.isoformat() if shift.end_time else "",
            created_at=shift.created_at,
        )


class LocationResponse(BaseModel):
    id: int
    name: str
    building: Optional[str]
    floor: Optional[str]
    room_or_area: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]

    model_config = {"from_attributes": True}


INCIDENT_TYPE_MAP = {
    "victim_of_violence": {"color": "#DC2626", "label": "Victim of Violence"},
    "problematic_patient": {"color": "#D97706", "label": "Problematic Patient"},
    "agitated_visitor": {"color": "#EA580C", "label": "Agitated Visitor"},
    "patient_with_sitter": {"color": "#2563EB", "label": "Patient with Sitter"},
    "elopment_patient": {"color": "#16A34A", "label": "Elopment Patient"},
    "hardware_facility_issue": {"color": "#4B5563", "label": "Hardware / Facility Issue"},
    "general_safety_concern": {"color": "#7E22CE", "label": "General Safety Concern"},
    "duress_alarm_call": {"color": "#1F2937", "label": "Duress Alarm Call"},
}


class IncidentTypeConfig(BaseModel):
    type: str
    color: str
    label: str


VALID_INCIDENT_TYPES = [
    "victim_of_violence",
    "problematic_patient",
    "agitated_visitor",
    "patient_with_sitter",
    "elopment_patient",
    "hardware_facility_issue",
    "general_safety_concern",
    "duress_alarm_call",
]

RESPONSE_PHASES = [
    "en_route",
    "situational_awareness",
    "on_scene",
    "dps_intervention",
    "supervisor_on_scene",
    "medical_needed",
    "situation_stabilized",
    "pending_followup",
    "report_completed",
]

RESPONSE_PHASE_LABELS = {
    "en_route": "Officer en route",
    "situational_awareness": "Situational awareness",
    "on_scene": "Officer on scene",
    "dps_intervention": "DPS intervention concluded",
    "supervisor_on_scene": "Supervisor on scene",
    "medical_needed": "Medical response needed",
    "situation_stabilized": "Situation stabilized",
    "pending_followup": "Pending follow-up",
    "report_completed": "Incident report completed",
}


class IncidentCreate(BaseModel):
    shift_id: int
    incident_type: str
    location_ref: str
    description: Optional[str] = None
    status: Optional[str] = "open"
    response_phase: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    floorplan_version_id: Optional[int] = None
    floorplan_x: Optional[float] = Field(None, ge=0, le=1)
    floorplan_y: Optional[float] = Field(None, ge=0, le=1)
    room_label: Optional[str] = Field(None, max_length=120)
    pin_reason: Optional[str] = Field(None, max_length=2000)

    @field_validator("incident_type")
    @classmethod
    def validate_incident_type(cls, v):
        if v not in VALID_INCIDENT_TYPES:
            raise ValueError(f"must be one of: {VALID_INCIDENT_TYPES}")
        return v

    @model_validator(mode="after")
    def validate_pin(self):
        values = (self.floorplan_version_id, self.floorplan_x, self.floorplan_y)
        if any(v is not None for v in values) and not all(v is not None for v in values):
            raise ValueError("floorplan_version_id, floorplan_x, and floorplan_y must be supplied together")
        return self

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, v):
        if v is not None and (v < -90 or v > 90):
            raise ValueError("latitude must be between -90 and 90")
        return v

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, v):
        if v is not None and (v < -180 or v > 180):
            raise ValueError("longitude must be between -180 and 180")
        return v


class IncidentUpdate(BaseModel):
    incident_type: Optional[str] = None
    location_ref: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    response_phase: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    floorplan_version_id: Optional[int] = None
    floorplan_x: Optional[float] = Field(None, ge=0, le=1)
    floorplan_y: Optional[float] = Field(None, ge=0, le=1)
    room_label: Optional[str] = Field(None, max_length=120)
    pin_reason: Optional[str] = Field(None, max_length=2000)

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, v):
        if v is not None and (v < -90 or v > 90):
            raise ValueError("latitude must be between -90 and 90")
        return v

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, v):
        if v is not None and (v < -180 or v > 180):
            raise ValueError("longitude must be between -180 and 180")
        return v


class IncidentFloorplanPinVersionResponse(BaseModel):
    id: int
    floorplan_id: int
    version: int
    floor_id: Optional[str] = None
    campus: str
    building: str
    building_id: str
    floor_name: str
    image: str
    bounds: list
    rotation: float

    model_config = {"from_attributes": True}

    @classmethod
    def from_version(cls, version):
        floorplan = getattr(version, "floorplan", None)
        return cls(
            id=version.id,
            floorplan_id=version.floorplan_id,
            version=version.version,
            floor_id=floorplan.floor_id if floorplan else None,
            campus=version.campus,
            building=version.building,
            building_id=version.building_id,
            floor_name=version.floor_name,
            image=version.image,
            bounds=[[float(version.south), float(version.west)], [float(version.north), float(version.east)]],
            rotation=float(version.rotation or 0),
        )


class IncidentResponse(BaseModel):
    id: int
    shift_id: int
    incident_type: str
    location_ref: str
    description: Optional[str]
    status: str
    response_phase: Optional[str] = None
    logged_by: int
    logged_by_user: Optional[UserResponse]
    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    floorplan_version_id: Optional[int] = None
    floorplan_x: Optional[float] = None
    floorplan_y: Optional[float] = None
    room_label: Optional[str] = None
    floorplan_version: Optional[IncidentFloorplanPinVersionResponse] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_incident(cls, incident):
        """Build an IncidentResponse from a SQLAlchemy Incident row."""
        from shapely.geometry.base import BaseGeometry
        
        lat: float | None = None
        lng: float | None = None
        geom = getattr(incident, "geom", None)
        
        if geom is not None:
            point: BaseGeometry | None = None
            
            # GeoAlchemy2 WKBElement (from PostGIS Geography/Geometry columns)
            if hasattr(geom, 'data') and isinstance(geom.data, bytes):
                from shapely import wkb
                point = wkb.loads(geom.data)
            
            # WKT text attribute (e.g. WKTElement)
            elif hasattr(geom, 'wkt') and geom.wkt:
                from shapely import wkt as shp_wkt
                point = shp_wkt.loads(geom.wkt)
            
            # Raw hex EWKB string
            elif isinstance(geom, str) and len(geom) >= 46 and geom.lower().startswith('01'):
                from shapely import wkb
                try:
                    point = wkb.loads(bytes.fromhex(geom))
                except Exception:
                    point = None
            
            if point and not point.is_empty:
                lat = float(point.y)
                lng = float(point.x)
        
        return cls(
            id=incident.id,
            shift_id=incident.shift_id,
            incident_type=incident.incident_type,
            location_ref=incident.location_ref,
            description=incident.description,
            status=incident.status,
            response_phase=incident.response_phase,
            logged_by=incident.logged_by,
            logged_by_user=incident.logged_by_user,
            created_at=incident.created_at,
            updated_at=incident.updated_at,
            archived_at=incident.archived_at,
            floorplan_version_id=incident.floorplan_version_id,
            floorplan_x=float(incident.floorplan_x) if incident.floorplan_x is not None else None,
            floorplan_y=float(incident.floorplan_y) if incident.floorplan_y is not None else None,
            room_label=incident.room_label,
            floorplan_version=(IncidentFloorplanPinVersionResponse.from_version(incident.floorplan_version)
                               if getattr(incident, "floorplan_version", None) is not None else None),
            latitude=lat,
            longitude=lng,
        )


class IncidentFloorplanPinHistoryResponse(BaseModel):
    id: int
    incident_id: int
    floorplan_version_id: Optional[int] = None
    floorplan_x: Optional[float] = None
    floorplan_y: Optional[float] = None
    room_label: Optional[str] = None
    actor_id: int
    reason: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class BroadcastIncidentResponse(BaseModel):
    id: int
    incident_type: str
    location_ref: str
    description: Optional[str]
    status: str
    response_phase: Optional[str] = None
    created_at: datetime
    type_info: IncidentTypeConfig
    archived_at: Optional[datetime] = None


class ResponsePhaseConfig(BaseModel):
    phase: str
    label: str


class GetResponsePhasesResponse(BaseModel):
    phases: list[ResponsePhaseConfig]

    model_config = {"from_attributes": True}


class HandoffNoteCreate(BaseModel):
    shift_id: int
    location_ref: Optional[str] = None
    note: str


class HandoffNoteResponse(BaseModel):
    id: int
    shift_id: int
    location_ref: Optional[str]
    note: str
    logged_by: int
    logged_by_user: Optional[UserResponse] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class FloorplanResponse(BaseModel):
    floor_id: str
    campus: str
    building: str
    building_id: str
    floor_name: str
    image: str
    bounds: list  # [[south, west], [north, east]] — leaflet imageOverlay order
    rotation: float = 0
    notes: Optional[str] = None
    current_version_id: Optional[int] = None
    version: Optional[int] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_floorplan(cls, fp):
        versions = fp.__dict__.get("versions", []) or []
        version = max(versions, key=lambda item: item.version, default=None)
        return cls(
            floor_id=fp.floor_id, campus=fp.campus, building=fp.building,
            building_id=fp.building_id, floor_name=fp.floor_name, image=fp.image,
            bounds=[[float(fp.south), float(fp.west)], [float(fp.north), float(fp.east)]],
            rotation=float(fp.rotation or 0), notes=fp.notes,
            current_version_id=getattr(fp, "current_version_id", None) or (version.id if version else None),
            version=version.version if version else None,
        )


class FloorplanCreate(BaseModel):
    floor_id: str = Field(min_length=1, max_length=60)
    campus: str = Field(min_length=1, max_length=120)
    building: str = Field(min_length=1, max_length=120)
    building_id: str = Field(min_length=1, max_length=60)
    floor_name: str = Field(min_length=1, max_length=120)
    image: str = Field(min_length=1, max_length=255)
    south: float
    west: float
    north: float
    east: float
    rotation: float = 0
    notes: Optional[str] = None
