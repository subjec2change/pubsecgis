/**
 * Incident coordinate resolution utility (Task 4).
 *
 * Provides a shared coordinate resolver that:
 *  1. Returns real incident coordinates (lat/lng) when present
 *  2. Falls back to deterministic hash-based offset from center for incidents without real coordinates
 *  3. Filters to only open/monitoring/escalating incidents (active statuses)
 *  4. Is used by both markers and heatmap to ensure alignment
 */

export interface CoordinatePoint {
  id: string;
  lat: number;
  lng: number;
  intensity?: number;
}

const ACTIVE_STATUSES = ['open', 'monitoring', 'escalating'];

/**
 * Deterministic seeded random from a string seed (same algorithm as OfficerMap).
 */
function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return () => {
    hash = (hash * 1664525 + 1013904223) | 0;
    return (hash >>> 0) / 4294967296;
  };
}

/**
 * Resolve coordinates for all active incidents.
 *
 * @param incidents - Array of incident objects (with lat/lng or not)
 * @param centerCenter - [lat, lng] for fallback deterministic positioning
 * @returns CoordinatePoint[] with real coords first, deterministic fallback for others
 */
export function getIncidentCoords(
  incidents: Array<{
    id: string;
    location_ref?: string;
    status: string;
    incident_type: string;
    latitude?: number | null;
    longitude?: number | null;
  }>,
  centerLat: string,
  centerLng: string,
): CoordinatePoint[] {
  const clat = parseFloat(centerLat);
  const clng = parseFloat(centerLng);

  return incidents
    .filter((incident) => ACTIVE_STATUSES.includes(incident.status))
    .map((incident) => {
      let lat: number;
      let lng: number;

      if (incident.latitude != null && incident.longitude != null) {
        // Real coordinates from database or map click
        lat = incident.latitude as number;
        lng = incident.longitude as number;
      } else {
        // Deterministic fallback: small random offset from center based on incident ID
        const random = seededRandom(incident.id);
        lat = clat + (random() - 0.5) * 0.0008;
        lng = clng + (random() - 0.5) * 0.0008;
      }

      return {
        id: incident.id,
        lat,
        lng,
        intensity: incident.status === 'open' ? 3 : incident.status === 'escalating' ? 2 : 1,
      };
    });
}
