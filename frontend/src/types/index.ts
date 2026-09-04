export interface User {
  id: string;
  username: string;
  full_name?: string;
  role?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export type IncidentType =
  | 'victim_of_violence'
  | 'problematic_patient'
  | 'agitated_visitor'
  | 'patient_with_sitter'
  | 'elopment_patient'
  | 'hardware_facility_issue'
  | 'general_safety_concern'
  | 'duress_alarm_call';

export type IncidentStatus = 'open' | 'monitoring' | 'escalating' | 'resolved' | 'archived';

export interface Incident {
  id: string;
  shift_id: number;
  incident_type: IncidentType;
  location_ref: string;
  description?: string;
  status: IncidentStatus;
  response_phase?: string | null;
  archived_at?: string;
  created_at: string;
  updated_at?: string;
  logged_by_user?: { username: string; display_name?: string };
}

export interface BroadcastIncident {
  id: string;
  incident_type: IncidentType;
  location_ref: string;
  description?: string;
  status?: string;
  response_phase?: string | null;
  created_at: string;
  color?: string;
}

export interface ColorMapping {
  incident_type: IncidentType;
  color: string;
}

export interface HandoffNote {
  id: string;
  shift_id: string;
  location_ref?: string;
  note: string;
  created_at: string;
  updated_at?: string;
}

export interface Location {
  id: string;
  name: string;
  ref_code?: string;
  description?: string;
}

export interface Shift {
  id: string;
  label: string;
  value: string;
}

export const SHIFTS: Shift[] = [
  { id: 'day', label: 'Day', value: 'day' },
  { id: 'evening', label: 'Evening', value: 'evening' },
  { id: 'night', label: 'Night', value: 'night' },
];

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  victim_of_violence: 'Victim of Violence',
  problematic_patient: 'Problematic Patient',
  agitated_visitor: 'Agitated Visitor',
  patient_with_sitter: 'Patient with Sitter',
  elopment_patient: 'Elopment Patient',
  hardware_facility_issue: 'Hardware/Facility Issue',
  general_safety_concern: 'General Safety Concern',
  duress_alarm_call: 'Duress Alarm Call',
};

export const DEFAULT_COLOR_MAP: Record<IncidentType, string> = {
  victim_of_violence: '#DC2626',
  problematic_patient: '#D97706',
  agitated_visitor: '#EA580C',
  patient_with_sitter: '#2563EB',
  elopment_patient: '#16A34A',
  hardware_facility_issue: '#4B5563',
  general_safety_concern: '#7E22CE',
  duress_alarm_call: '#1F2937',
};
