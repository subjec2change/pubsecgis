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

export interface FloorplanBuilding {
  id: string;
  name: string;
  color: string;
  bounds: [number, number, number, number]; // [southwestLat, southwestLng, northeastLat, northeastLng]
  floors?: { id: string; name: string }[];
}

export interface FloorplanView {
  id: string;
  label: string;
  center: [number, number];
  zoom: number;
  buildings: FloorplanBuilding[];
  color: string;
}

export const FLOORPLAN_VIEWS: FloorplanView[] = [
  {
    id: 'main-building',
    label: 'Main Building',
    center: [38.6272, -90.2420] as [number, number],
    zoom: 18,
    color: '#3B82F6',
    buildings: [
      {
        id: 'main-wing',
        name: 'Main Wing (A Floor)',
        color: '#3B82F6',
        bounds: [38.6273, -90.2425, 38.6271, -90.2415] as [number, number, number, number],
        floors: [
          { id: 'a1', name: 'Floor 1 - Lobby' },
          { id: 'a2', name: 'Floor 2 - Offices' },
          { id: 'a3', name: 'Floor 3 - Medical' },
        ],
      },
      {
        id: 'main-east',
        name: 'Main Wing (B Floor)',
        color: '#60A5FA',
        bounds: [38.6270, -90.2422, 38.6268, -90.2412] as [number, number, number, number],
        floors: [
          { id: 'b1', name: 'Floor 1 - Emergency' },
          { id: 'b2', name: 'Floor 2 - Surgery' },
        ],
      },
    ],
  },
  {
    id: 'childrens-hospital',
    label: 'Children\u2019s Hospital',
    center: [38.6263, -90.2415] as [number, number],
    zoom: 18,
    color: '#22C55E',
    buildings: [
      {
        id: 'childrens-main',
        name: 'Children\u2019s Main Building',
        color: '#22C55E',
        bounds: [38.6265, -90.2420, 38.6260, -90.2410] as [number, number, number, number],
        floors: [
          { id: 'c1', name: 'Floor 1 - ER' },
          { id: 'c2', name: 'Floor 2 - Inpatient' },
          { id: 'c3', name: 'Floor 3 - ICN' },
        ],
      },
    ],
  },
  {
    id: 'adult-ed',
    label: 'Adult ED',
    center: [38.6266, -90.2408] as [number, number],
    zoom: 18,
    color: '#EF4444',
    buildings: [
      {
        id: 'adult-ed-main',
        name: 'Adult Emergency Dept',
        color: '#EF4444',
        bounds: [38.6268, -90.2412, 38.6264, -90.2405] as [number, number, number, number],
        floors: [
          { id: 'd1', name: 'Floor 1 - Triage' },
          { id: 'd2', name: 'Floor 2 - Consults' },
        ],
      },
    ],
  },
  {
    id: 'parking-garage',
    label: 'Parking Garage',
    center: [38.6274, -90.2404] as [number, number],
    zoom: 18,
    color: '#6B7280',
    buildings: [
      {
        id: 'garage-a',
        name: 'Garage A - Lower',
        color: '#6B7280',
        bounds: [38.6275, -90.2408, 38.6272, -90.2400] as [number, number, number, number],
        floors: [
          { id: 'g1', name: 'Level -1' },
          { id: 'g2', name: 'Level -2' },
        ],
      },
    ],
  },
];

export type FloorplanViewId = (typeof FLOORPLAN_VIEWS)[number]['id'];
