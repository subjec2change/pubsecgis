import client from './client';
import type {
  AuthResponse,
  User,
  Incident,
  BroadcastIncident,
  ColorMapping,
  HandoffNote,
  Location,
  FloorplanEntry,
  ShiftReport,
  FloorplanPinHistory,
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
  latitude?: number;
  longitude?: number;
  floorplan_version_id?: number | string;
  floorplan_x?: number;
  floorplan_y?: number;
  room_label?: string;
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
    ...(data.latitude != null && { latitude: data.latitude }),
    ...(data.longitude != null && { longitude: data.longitude }),
    ...(data.floorplan_version_id != null && { floorplan_version_id: data.floorplan_version_id }),
    ...(data.floorplan_x != null && { floorplan_x: data.floorplan_x }),
    ...(data.floorplan_y != null && { floorplan_y: data.floorplan_y }),
    ...(data.room_label?.trim() && { room_label: data.room_label.trim() }),
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
    latitude?: number | null;
    longitude?: number | null;
    floorplan_version_id?: number | string | null;
    floorplan_x?: number | null;
    floorplan_y?: number | null;
    room_label?: string | null;
    pin_reason?: string;
  }
): Promise<Incident> {
  const res = await client.put<Incident>(`/incidents/${id}`, data);
  return res.data;
}

export async function deleteIncident(id: string, reason: string): Promise<void> {
  await client.delete(`/incidents/${id}`, { params: { reason } });
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

// Heatmap
export async function getHeatmapData(centerLat: number, centerLng: number, radius = 500, limit = 200): Promise<{ lat: number; lng: number; intensity: number }[]> {
  const res = await client.get<{ lat: number; lng: number; intensity: number }[]>('/incidents/heatmap', {
    params: { lat: centerLat, lng: centerLng, radius, limit },
  });
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

// Floorplans
export async function getFloorplans(q?: string): Promise<FloorplanEntry[]> {
  const res = await client.get<FloorplanEntry[]>('/floorplans', {
    params: q ? { q } : undefined,
  });
  return res.data;
}

export async function getFloorplanPinHistory(id: string): Promise<FloorplanPinHistory[]> {
  const res = await client.get<FloorplanPinHistory[]>(`/incidents/${id}/floorplan-history`);
  return res.data;
}

// Reports (lead/admin)
export async function getShiftReport(date?: string, code?: string): Promise<ShiftReport> {
  const params: Record<string, string> = {};
  if (date && code) {
    params.date = date;
    params.code = code;
  }
  const res = await client.get<ShiftReport>('/reports/shift', { params });
  return res.data;
}

export async function downloadShiftReportPdf(date?: string, code?: string): Promise<Blob> {
  const params: Record<string, string> = { format: 'pdf' };
  if (date && code) {
    params.date = date;
    params.code = code;
  }
  const res = await client.get<Blob>('/reports/shift', { params, responseType: 'blob' });
  return res.data;
}

// Shifts
export async function getShiftsByDate(dateIso: string): Promise<{ id: number; shift_code: string }[]> {
  const res = await client.get<{ id: number; shift_code: string }[]>('/shifts', { params: { date: dateIso } });
  return res.data;
}
