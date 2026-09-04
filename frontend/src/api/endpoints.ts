import client from './client';
import type {
  AuthResponse,
  User,
  Incident,
  BroadcastIncident,
  ColorMapping,
  HandoffNote,
  Location,
} from '../types';

// Auth
export async function login(username: string, password: string): Promise<AuthResponse> {
  const res = await client.post<AuthResponse>('/auth/login', { username, password });
  return res.data;
}

export async function getCurrentUser(): Promise<User> {
  const res = await client.get<User>('/auth/me');
  return res.data;
}

// Incidents
export async function getIncidents(params?: {
  status?: string;
  type?: string;
  date?: string;
  location?: string;
  include_archived?: boolean;
}): Promise<Incident[]> {
  const res = await client.get<Incident[]>('/incidents', { params });
  return res.data;
}

export async function createIncident(data: {
  shift_id: string | number;
  incident_type: string;
  location_ref: string;
  description?: string;
  status?: string;
  response_phase?: string | undefined;
}): Promise<Incident> {
  // Convert shift name ("day"/"evening"/"night") to today's shift ID
  let shiftId: number;
  if (typeof data.shift_id === 'number') {
    shiftId = data.shift_id;
  } else {
    // Map shift names to codes
    const shiftMap: Record<string, string> = {
      'day': 'DAY',
      'evening': 'EVE',
      'night': 'NIGHT',
    };
    const shiftCode = shiftMap[data.shift_id];
    if (!shiftCode) throw new Error(`Invalid shift: ${data.shift_id}`);
    const today = new Date().toISOString().split('T')[0];
    let shifts: any[] = [];
    try {
      const shiftsRes = await client.get('/shifts', { params: { date: today } });
      shifts = shiftsRes.data || [];
    } catch {
      // Shifts not available, will create
    }
    let shift: any | null = shifts.find((s: any) => s.shift_code === shiftCode);
    if (!shift) {
      // Create the shift if it doesn't exist
      const createRes = await client.post('/shifts', null, {
        params: { shift_code: shiftCode, shift_date: today },
      });
      shift = createRes.data;
    }
    if (!shift || !shift.id) throw new Error(`Shift not found or could not be created: ${data.shift_id} for ${today}`);
    shiftId = shift.id;
  }

  const res = await client.post<Incident>('/incidents', {
    shift_id: shiftId,
    incident_type: data.incident_type,
    location_ref: data.location_ref,
    description: data.description,
    status: data.status || 'open',
    ...(data.response_phase && { response_phase: data.response_phase }),
  });
  return res.data;
}

export async function updateIncident(
  id: string,
  data: {
    incident_type?: string;
    location_ref?: string;
    description?: string;
    status?: string;
    response_phase?: string | null;
  }
): Promise<Incident> {
  const res = await client.put<Incident>(`/incidents/${id}`, data);
  return res.data;
}

export async function deleteIncident(id: string): Promise<void> {
  await client.delete(`/incidents/${id}`);
}

// Broadcast (no auth required)
export async function getBroadcastIncidents(hours = 24): Promise<BroadcastIncident[]> {
  const res = await client.get<BroadcastIncident[]>('/broadcast/incidents', { params: { hours } });
  return res.data;
}

export async function getColorConfig(): Promise<ColorMapping[]> {
  const res = await client.get<ColorMapping[]>('/broadcast/config');
  return res.data;
}

// Handoff
export async function createHandoffNote(data: {
  shift_id: number | string;
  location_ref?: string;
  note: string;
}): Promise<HandoffNote> {
  const res = await client.post<HandoffNote>('/handoff/notes', data);
  return res.data;
}

export async function getHandoffNotes(params?: {
  shift?: string;
  date?: string;
}): Promise<HandoffNote[]> {
  const res = await client.get<HandoffNote[]>('/handoff/notes', { params });
  return res.data;
}

// Locations
export async function searchLocations(q: string): Promise<Location[]> {
  if (!q || q.length < 2) return [];
  const res = await client.get<Location[]>('/locations', { params: { q } });
  return res.data;
}

// Response Phases
export async function getResponsePhases(): Promise<{ phase: string; label: string }[]> {
  const res = await client.get<{ phases: { phase: string; label: string }[] }>('/incidents/response-phases');
  return res.data.phases;
}
