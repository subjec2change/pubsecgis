from pydantic import BaseModel, Field, field_validator
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

    @field_validator("incident_type")
    @classmethod
    def validate_incident_type(cls, v):
        if v not in VALID_INCIDENT_TYPES:
            raise ValueError(f"must be one of: {VALID_INCIDENT_TYPES}")
        return v


class IncidentUpdate(BaseModel):
    incident_type: Optional[str] = None
    location_ref: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    response_phase: Optional[str] = None


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
