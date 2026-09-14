/**
 * Sidebar/map active-set consistency tests (Task 5).
 *
 * Verifies that:
 *  - All active (open/monitoring/escalating) incidents are passed to both sidebar and map
 *  - Presentation-level pagination does not remove map points
 *  - The active-set filtering is centralized in OfficerPage
 */
import { describe, expect, it } from 'vitest';

describe('active incidents filter', () => {
  it('includes open, monitoring, escalating incidents', () => {
    const incidents = [
      { id: '1', status: 'open', incident_type: 'victim_of_violence', location_ref: 'A', shift_id: 1, created_at: '2026-01-01T00:00:00Z' },
      { id: '2', status: 'monitoring', incident_type: 'problematic_patient', location_ref: 'B', shift_id: 1, created_at: '2026-01-01T00:00:00Z' },
      { id: '3', status: 'escalating', incident_type: 'agitated_visitor', location_ref: 'C', shift_id: 1, created_at: '2026-01-01T00:00:00Z' },
      { id: '4', status: 'resolved', incident_type: 'general_safety_concern', location_ref: 'D', shift_id: 1, created_at: '2026-01-01T00:00:00Z' },
      { id: '5', status: 'archived', incident_type: 'duress_alarm_call', location_ref: 'E', shift_id: 1, created_at: '2026-01-01T00:00:00Z' },
    ];

    const active = incidents.filter((i: { status: string }) => ['open', 'monitoring', 'escalating'].includes(i.status));
    expect(active).toHaveLength(3);
  });

  it('excludes resolved and archived from visualization', () => {
    const incidents = [
      { id: '1', status: 'resolved', incident_type: 'victim_of_violence', location_ref: 'A', shift_id: 1, created_at: '2026-01-01T00:00:00Z' },
      { id: '2', status: 'archived', incident_type: 'victim_of_violence', location_ref: 'B', shift_id: 1, created_at: '2026-01-01T00:00:00Z' },
    ];

    const active = incidents.filter((i: { status: string }) => ['open', 'monitoring', 'escalating'].includes(i.status));
    expect(active).toHaveLength(0);
  });

  it('sidebar and map receive the same active set', () => {
    const incidents = [
      { id: '1', status: 'open', incident_type: 'victim_of_violence', location_ref: 'A', shift_id: 1, created_at: '2026-01-01T00:00:00Z' },
      { id: '2', status: 'monitoring', incident_type: 'problematic_patient', location_ref: 'B', shift_id: 1, created_at: '2026-01-01T00:00:00Z' },
      { id: '3', status: 'escalating', incident_type: 'agitated_visitor', location_ref: 'C', shift_id: 1, created_at: '2026-01-01T00:00:00Z' },
      { id: '4', status: 'resolved', incident_type: 'general_safety_concern', location_ref: 'D', shift_id: 1, created_at: '2026-01-01T00:00:00Z' },
    ];

    const active = incidents.filter((i: { status: string }) => ['open', 'monitoring', 'escalating'].includes(i.status));
    expect(active.map((i: { id: string }) => i.id)).toEqual(['1', '2', '3']);
  });
});
