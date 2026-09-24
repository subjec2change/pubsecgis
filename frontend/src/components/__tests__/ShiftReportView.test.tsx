import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ShiftReportView from '../ShiftReportView';
import * as endpoints from '../../api/endpoints';
import type { ShiftReport } from '../../types';

vi.mock('../../api/endpoints');

const REPORT: ShiftReport = {
  shift: { id: 3, date: '2026-09-16', code: 'EVE', start_time: '14:30', end_time: '23:00', in_progress: false },
  generated_at: '2026-09-22T11:00:00-05:00',
  stats: {
    total: 2, by_type: { victim_of_violence: 1, patient_with_sitter: 1 },
    by_officer: [
      { author: 'Officer Chen', total: 1, by_type: { victim_of_violence: 1 } },
      { author: 'Officer Murphy', total: 1, by_type: { patient_with_sitter: 1 } },
    ],
  },
  timeline: [
    { label: '14:00', count: 0 },
    { label: '15:00', count: 2 },
  ],
  incidents: [
    { id: 1, created_at: '2026-09-16T15:05:00-05:00', incident_type: 'victim_of_violence',
      location_ref: 'MAIN-LOBBY', status: 'resolved', response_phase: 'on_scene',
      description: 'long detail text', author: 'Officer Chen' },
    { id: 2, created_at: '2026-09-16T15:40:00-05:00', incident_type: 'patient_with_sitter',
      location_ref: 'ICU-4W', status: 'open', response_phase: null, description: null, author: 'Officer Murphy',
      room_label: 'Room 410', floorplan_version_id: 44, floorplan_x: 0.25, floorplan_y: 0.75,
      floorplan: { id: 44, version: 3, campus: 'BJH', building: 'North', building_id: 'NORTH', floor_name: '4W' } } as ShiftReport['incidents'][number],
  ],
  handoff_notes: [
    { id: 9, note: 'elevator stalled', author: 'Officer Chen', created_at: '2026-09-16T22:45:00-05:00' },
  ],
};

describe('ShiftReportView', () => {
  beforeEach(() => {
    vi.mocked(endpoints.getShiftReport).mockReset();
    vi.mocked(endpoints.downloadShiftReportPdf).mockReset();
  });

  it('loads the default (most recently ended) report on mount', async () => {
    vi.mocked(endpoints.getShiftReport).mockResolvedValue(REPORT);
    render(<ShiftReportView />);
    await waitFor(() => expect(endpoints.getShiftReport).toHaveBeenCalled());
    expect(await screen.findByText(/2026-09-16/)).toBeInTheDocument();
    expect(screen.getByText(/2 incidents/)).toBeInTheDocument();
  });

  it('renders per-type stats, timeline, incidents, and handoff notes', async () => {
    vi.mocked(endpoints.getShiftReport).mockResolvedValue(REPORT);
    render(<ShiftReportView />);
    expect((await screen.findAllByText('Victim of Violence')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Patient with Sitter').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('MAIN-LOBBY')).toBeInTheDocument();
    expect(screen.getByText('elevator stalled')).toBeInTheDocument();
    // v2 per-officer breakdown
    expect(screen.getAllByText('Officer Chen').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Officer Murphy').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('By officer')).toBeInTheDocument();
    // handoff row carries its own author line (breakdown table also shows Chen)
    expect(screen.getByText(/22:45 — Officer Chen/)).toBeInTheDocument();
  });

  it('toggles incident description on row click', async () => {
    vi.mocked(endpoints.getShiftReport).mockResolvedValue(REPORT);
    render(<ShiftReportView />);
    const row = await screen.findByText('MAIN-LOBBY');
    expect(screen.queryByText('long detail text')).not.toBeInTheDocument();
    fireEvent.click(row.closest('tr')!);
    expect(screen.getByText('long detail text')).toBeInTheDocument();
  });

  it('expands incident room and immutable floorplan details even when description is empty', async () => {
    vi.mocked(endpoints.getShiftReport).mockResolvedValue(REPORT);
    render(<ShiftReportView />);
    fireEvent.click((await screen.findByText('ICU-4W')).closest('tr')!);
    expect(screen.getByText('Room: Room 410')).toBeInTheDocument();
    expect(screen.getByText(/Floorplan: BJH \/ North \/ 4W \(v3\)/)).toBeInTheDocument();
  });

  it('shows live snapshot badge for in-progress shift', async () => {
    vi.mocked(endpoints.getShiftReport).mockResolvedValue({
      ...REPORT, shift: { ...REPORT.shift, in_progress: true },
    });
    render(<ShiftReportView />);
    expect(await screen.findByText(/LIVE SNAPSHOT/)).toBeInTheDocument();
  });

  it('passes date+code when Load is pressed', async () => {
    vi.mocked(endpoints.getShiftReport).mockResolvedValue(REPORT);
    render(<ShiftReportView />);
    await screen.findByText(/2 incidents/);
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-15' } });
    fireEvent.change(screen.getByLabelText('Shift'), { target: { value: 'DAY' } });
    fireEvent.click(screen.getByText('Load'));
    await waitFor(() =>
      expect(endpoints.getShiftReport).toHaveBeenCalledWith('2026-09-15', 'DAY'),
    );
  });

  it('downloads the PDF from the preview', async () => {
    vi.mocked(endpoints.getShiftReport).mockResolvedValue(REPORT);
    vi.mocked(endpoints.downloadShiftReportPdf).mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
    render(<ShiftReportView />);
    fireEvent.click(await screen.findByText('⬇ PDF'));
    await waitFor(() =>
      expect(endpoints.downloadShiftReportPdf).toHaveBeenCalledWith('2026-09-16', 'EVE'),
    );
  });

  it('surfaces 404 as shift not found', async () => {
    vi.mocked(endpoints.getShiftReport).mockRejectedValue({ response: { status: 404 } });
    render(<ShiftReportView />);
    expect(await screen.findByText(/Shift not found/)).toBeInTheDocument();
  });
});
