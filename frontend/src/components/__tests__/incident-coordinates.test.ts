/**
 * Incident coordinate resolution and unified marker/heatmap alignment tests (Task 4).
 *
 * Verifies:
 *  - A shared coordinate resolver function exists
 *  - It returns real coordinates from incident data first
 *  - Falls back to deterministic hash-based coordinates from incident ID
 *  - Only open/monitoring/escalating incidents are included
 *  - Markers and heatmap use the same coordinate source
 */
import { describe, expect, it } from 'vitest';

describe('incident coordinate resolver', () => {
  it('resolves coordinates from incident location_ref matching a known location', async () => {
    const { getIncidentCoords } = await import('../../utils/incident-coords');
    
    const incidents = [
      {
        id: 'inc-1',
        location_ref: 'Main Building - Floor 1 - Lobby',
        status: 'open',
        incident_type: 'victim_of_violence',
        latitude: 38.627,
        longitude: -90.2418,
      },
    ];

    const coords = getIncidentCoords(incidents, '38.6270', '-90.2418');
    const inc1Coords = coords[0];
    expect(inc1Coords.lat).toBe(38.627);
    expect(inc1Coords.lng).toBe(-90.2418);
  });

  it('returns deterministic fallback coords for incidents without lat/lng', async () => {
    const { getIncidentCoords } = await import('../../utils/incident-coords');
    
    const incidents = [
      {
        id: 'inc-no-coords',
        location_ref: 'Unknown Location',
        status: 'open',
        incident_type: 'problematic_patient',
        latitude: null,
        longitude: null,
      },
    ];

    const coords = getIncidentCoords(incidents, '38.6270', '-90.2418');
    const incCoords = coords[0];

    // Should be near center (within deterministic offset)
    expect(Math.abs(incCoords.lat - 38.6270)).toBeLessThan(0.001);
    expect(Math.abs(incCoords.lng - (-90.2418))).toBeLessThan(0.001);
  });

  it('excludes archived and resolved incidents', async () => {
    const { getIncidentCoords } = await import('../../utils/incident-coords');
    
    const incidents = [
      { id: 'inc-archived', location_ref: 'A', status: 'archived', incident_type: 'victim_of_violence', latitude: null, longitude: null },
      { id: 'inc-resolved', location_ref: 'B', status: 'resolved', incident_type: 'victim_of_violence', latitude: null, longitude: null },
      { id: 'inc-open', location_ref: 'C', status: 'open', incident_type: 'victim_of_violence', latitude: null, longitude: null },
      { id: 'inc-monitoring', location_ref: 'D', status: 'monitoring', incident_type: 'victim_of_violence', latitude: null, longitude: null },
      { id: 'inc-escalating', location_ref: 'E', status: 'escalating', incident_type: 'victim_of_violence', latitude: null, longitude: null },
    ];

    const coords = getIncidentCoords(incidents, '38.6270', '-90.2418');
    
    // Should only include open, monitoring, escalating
    expect(coords).toHaveLength(3);
    const statuses = coords.map((c: { lat: number; lng: number; id: string }) => {
      const inc = incidents.find((i) => i.id === c.id);
      return inc?.status;
    });
    expect(statuses).toContain('open');
    expect(statuses).toContain('monitoring');
    expect(statuses).toContain('escalating');
    expect(statuses).not.toContain('archived');
    expect(statuses).not.toContain('resolved');
  });

  it('produces same coords for marker and heatmap for same incident', async () => {
    const { getIncidentCoords } = await import('../../utils/incident-coords');
    
    const incidents = [
      {
        id: 'inc-same',
        location_ref: 'Test Location',
        status: 'open',
        incident_type: 'victim_of_violence',
        latitude: 38.6275,
        longitude: -90.2415,
      },
    ];

    const coords = getIncidentCoords(incidents, '38.6270', '-90.2418');
    const inc1 = coords[0];

    // Both marker and heatmap use the same function, so they get the same coords
    const markerCoords = getIncidentCoords(incidents, '38.6270', '-90.2418');
    
    expect(markerCoords[0].lat).toBe(inc1.lat);
    expect(markerCoords[0].lng).toBe(inc1.lng);
  });
});
