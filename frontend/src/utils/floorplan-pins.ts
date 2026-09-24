export interface FloorplanPin {
  floorplan_version_id: number | string;
  floorplan_x: number;
  floorplan_y: number;
}

export function normalizedFloorplanPoint(
  latitude: number,
  longitude: number,
  bounds: [[number, number], [number, number]],
): { floorplan_x: number; floorplan_y: number } {
  const [[south, west], [north, east]] = bounds;
  return {
    floorplan_x: Math.max(0, Math.min(1, (longitude - west) / (east - west))),
    floorplan_y: Math.max(0, Math.min(1, (north - latitude) / (north - south))),
  };
}

export function floorplanIncidentPins<T extends { floorplan_version_id?: number | string | null; floorplan_x?: number | null; floorplan_y?: number | null }>(
  incidents: T[],
  selectedVersionId: number | string,
): T[] {
  return incidents.filter((incident) =>
    incident.floorplan_version_id != null &&
    String(incident.floorplan_version_id) === String(selectedVersionId) &&
    incident.floorplan_x != null && incident.floorplan_y != null,
  );
}
