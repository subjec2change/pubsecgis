import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FloorplanSelector from '../FloorplanSelector';
import * as endpoints from '../../api/endpoints';
import type { FloorplanEntry } from '../../types';

vi.mock('../../api/endpoints');

const ENTRIES: FloorplanEntry[] = [
  {
    floor_id: 'pv-l8', campus: 'North Campus', building: 'Parkview Tower',
    building_id: 'parkview-tower', floor_name: 'Level 8',
    image: '/floorplans/parkview-l8.png',
    bounds: [[38.638506, -90.265506], [38.639354, -90.264671]], rotation: 10,
  },
  {
    floor_id: 'pv-l9', campus: 'North Campus', building: 'Parkview Tower',
    building_id: 'parkview-tower', floor_name: 'Level 9',
    image: '/floorplans/parkview-l9.png',
    bounds: [[38.638506, -90.265506], [38.639354, -90.264671]], rotation: 10,
  },
  {
    floor_id: 'cam-l1', campus: 'North Campus', building: 'Center for Advanced Medicine',
    building_id: 'cam', floor_name: 'Level 1',
    image: '/floorplans/cam-l1.png',
    bounds: [[38.638233, -90.263779], [38.638906, -90.262658]], rotation: 10,
  },
];

describe('FloorplanSelector', () => {
  let onFloorSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onFloorSelect = vi.fn();
    vi.mocked(endpoints.getFloorplans).mockReset();
    vi.mocked(endpoints.getFloorplans).mockResolvedValue(ENTRIES);
  });

  it('loads the registry and shows all floors when opened', async () => {
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);
    await waitFor(() => expect(endpoints.getFloorplans).toHaveBeenCalled());

    fireEvent.focus(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(screen.getByText('Level 8')).toBeInTheDocument();
      expect(screen.getByText('Level 9')).toBeInTheDocument();
      expect(screen.getByText('Level 1')).toBeInTheDocument();
    });
  });

  it('filters by tokens across campus/building/floor', async () => {
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'parkview 8' } });

    await waitFor(() => expect(screen.getByText('Level 8')).toBeInTheDocument());
    expect(screen.queryByText('Level 9')).not.toBeInTheDocument();
    expect(screen.queryByText('Level 1')).not.toBeInTheDocument();
  });

  it('calls onFloorSelect with floorId, name, and registry entry', async () => {
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'cam' } });

    fireEvent.click(await screen.findByText('Level 1'));

    expect(onFloorSelect).toHaveBeenCalledWith('cam-l1', 'Level 1', ENTRIES[2]);
  });

  it('shows the selected label after choosing a floor', async () => {
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'parkview 9' } });
    fireEvent.click(await screen.findByText('Level 9'));

    expect(input.value).toBe('Parkview Tower — Level 9');
  });

  it('clears the selection via the clear button', async () => {
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'parkview 8' } });
    fireEvent.click(await screen.findByText('Level 8'));

    fireEvent.click(screen.getByLabelText('Clear floor selection'));

    expect(onFloorSelect).toHaveBeenLastCalledWith('', '');
    expect(input.value).toBe('');
  });

  it('selects the first match on Enter', async () => {
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'parkview' } });
    // wait for the async registry to arrive before pressing Enter
    await screen.findByText('Level 8');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(onFloorSelect).toHaveBeenCalledWith('pv-l8', 'Level 8', ENTRIES[0]),
    );
  });

  it('shows an empty-state when nothing matches', async () => {
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzzz' } });

    await waitFor(() =>
      expect(screen.getByText('No matching floor plans')).toBeInTheDocument(),
    );
  });

  it('surfaces an error when the registry is unreachable', async () => {
    vi.mocked(endpoints.getFloorplans).mockRejectedValueOnce(new Error('down'));
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);

    await waitFor(() =>
      expect(screen.getByText('Floor plans unavailable')).toBeInTheDocument(),
    );
  });
});
