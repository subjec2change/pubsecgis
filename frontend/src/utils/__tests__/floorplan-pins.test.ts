import { describe, expect, it } from 'vitest';
import { floorplanIncidentPins, normalizedFloorplanPoint } from '../../utils/floorplan-pins';

describe('floorplan-local incident pins', () => {
  const bounds: [[number, number], [number, number]] = [[10, 20], [20, 40]];

  it('normalizes clicks from the top-left of the selected sheet', () => {
    expect(normalizedFloorplanPoint(20, 20, bounds)).toEqual({ floorplan_x: 0, floorplan_y: 0 });
    expect(normalizedFloorplanPoint(15, 30, bounds)).toEqual({ floorplan_x: 0.5, floorplan_y: 0.5 });
  });

  it('keeps only pins from the exact selected floorplan version', () => {
    const incidents = [
      { floorplan_version_id: 7, floorplan_x: 0.2, floorplan_y: 0.3 },
      { floorplan_version_id: 8, floorplan_x: 0.4, floorplan_y: 0.5 },
      { floorplan_version_id: 7, floorplan_x: null, floorplan_y: 0.1 },
    ];
    expect(floorplanIncidentPins(incidents, 7)).toEqual([incidents[0]]);
  });
});
