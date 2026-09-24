/**
 * Incident placement workflow tests.
 */
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import IncidentForm from '../IncidentForm';
import { createIncident, updateIncident } from '../../api/endpoints';

vi.mock('../../api/endpoints', () => ({
  searchLocations: vi.fn().mockResolvedValue([]),
  createIncident: vi.fn().mockResolvedValue({}),
  updateIncident: vi.fn().mockResolvedValue({}),
}));
vi.mock('../ShiftSelector', () => ({ default: () => <div /> }));

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); });

const fillRequiredLocation = () => {
  fireEvent.change(screen.getByLabelText(/location$/i), { target: { value: 'Main lobby' } });
};

describe('IncidentForm placement workflow', () => {
  it('renders the form when open', () => {
    render(<IncidentForm isOpen onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByText(/new incident/i)).toBeInTheDocument();
  });

  it('renders a location input for manual entry', () => {
    render(<IncidentForm isOpen onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
  });

  it('shows map coordinates when provided', () => {
    render(<IncidentForm isOpen onClose={vi.fn()} onSubmit={vi.fn()} coordinates={{ latitude: 38.627, longitude: -90.2418 }} />);
    expect(screen.getByText(/38\.6270/)).toBeInTheDocument();
    expect(screen.getByText(/-90\.2418/)).toBeInTheDocument();
  });

  it('submits map coordinates in the create payload', async () => {
    render(<IncidentForm isOpen onClose={vi.fn()} onSubmit={vi.fn()} coordinates={{ latitude: 38.627, longitude: -90.2418 }} />);
    fillRequiredLocation();
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => expect(createIncident).toHaveBeenCalledWith(expect.objectContaining({ latitude: 38.627, longitude: -90.2418 })));
  });

  it('blocks creation when a selected floorplan has no clicked pin', async () => {
    render(<IncidentForm isOpen onClose={vi.fn()} onSubmit={vi.fn()} preSelectedFloor="Level 3" />);
    fillRequiredLocation();
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(await screen.findByText(/place the incident on the selected floorplan/i)).toBeInTheDocument();
    expect(createIncident).not.toHaveBeenCalled();
  });

  it('submits the selected immutable version and normalized coordinates', async () => {
    render(<IncidentForm isOpen onClose={vi.fn()} onSubmit={vi.fn()} floorplanPin={{ floorplan_version_id: 42, floorplan_x: .25, floorplan_y: .75 }} />);
    fillRequiredLocation();
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => expect(createIncident).toHaveBeenCalledWith(expect.objectContaining({ floorplan_version_id: 42, floorplan_x: .25, floorplan_y: .75 })));
  });

  it('requires a free-text reason before changing or clearing an existing pin', async () => {
    const incident = { id: '19', shift_id: 4, incident_type: 'victim_of_violence' as const, location_ref: 'Main lobby', status: 'open' as const, created_at: '', floorplan_version_id: 10, floorplan_x: .3, floorplan_y: .4, floorplan_version: { id: 10, floorplan_id: 2, version: 1, floor_id: 'a', campus: 'North', building: 'Main', building_id: 'main', floor_name: 'Level 1', image: '/v1.png', bounds: [[0,0],[1,1]] as [[number,number],[number,number]], rotation: 0 } };
    render(<IncidentForm isOpen onClose={vi.fn()} onSubmit={vi.fn()} editIncident={incident} floorplanPin={null} />);
    fillRequiredLocation();
    fireEvent.click(screen.getByRole('button', { name: /update/i }));
    expect(await screen.findByText(/reason is required/i)).toBeInTheDocument();
    expect(updateIncident).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/pin change reason/i), { target: { value: 'Correcting floor location' } });
    fireEvent.click(screen.getByRole('button', { name: /update/i }));
    await waitFor(() => expect(updateIncident).toHaveBeenCalledWith('19', expect.objectContaining({ floorplan_version_id: null, floorplan_x: null, floorplan_y: null, pin_reason: 'Correcting floor location' })));
  });

  it('requires a reason when reassigning an existing pin to another version', async () => {
    const incident = { id: '20', shift_id: 4, incident_type: 'victim_of_violence' as const, location_ref: 'Main lobby', status: 'open' as const, created_at: '', floorplan_version_id: 10, floorplan_x: .3, floorplan_y: .4, room_label: 'Old room' };
    render(<IncidentForm isOpen onClose={vi.fn()} onSubmit={vi.fn()} editIncident={incident} floorplanPin={{ floorplan_version_id: 11, floorplan_x: .6, floorplan_y: .2 }} />);
    fillRequiredLocation();
    fireEvent.click(screen.getByRole('button', { name: /update/i }));
    expect(await screen.findByText(/reason is required/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/pin change reason/i), { target: { value: 'Reassigned to the correct sheet' } });
    fireEvent.click(screen.getByRole('button', { name: /update/i }));
    await waitFor(() => expect(updateIncident).toHaveBeenCalledWith('20', expect.objectContaining({ floorplan_version_id: 11, floorplan_x: .6, floorplan_y: .2, pin_reason: 'Reassigned to the correct sheet' })));
  });
});
