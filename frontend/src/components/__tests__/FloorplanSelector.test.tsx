import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FloorplanSelector from '../FloorplanSelector';
import floorplans from '../../data/floorplans.json';

describe('FloorplanSelector', () => {
  let onFloorSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onFloorSelect = vi.fn();
  });

  it('renders building dropdown with all buildings', () => {
    const buildingNames = floorplans.map((b) => b.building);
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);

    buildingNames.forEach((name) => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
  });

  it('renders floor dropdown when a building is selected', () => {
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);

    const firstBuilding = floorplans[0].building;
    const buildingSelect = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(buildingSelect, { target: { value: firstBuilding } });

    const floors = floorplans[0].floors.map((f) => f.name);
    floors.forEach((name) => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
  });

  it('calls onFloorSelect with floorId and floorName when a floor is selected', () => {
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);

    const firstBuilding = floorplans[0].building;
    const buildingSelect = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(buildingSelect, { target: { value: firstBuilding } });

    const firstFloor = floorplans[0].floors[0];
    const floorSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    fireEvent.change(floorSelect, { target: { value: firstFloor.name } });

    expect(onFloorSelect).toHaveBeenCalledWith(firstFloor.id, firstFloor.name);
  });

  it('resets floor selection when building changes', () => {
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);

    const firstBuilding = floorplans[0].building;
    const buildingSelect = screen.getByRole('combobox') as HTMLSelectElement;

    // Building change calls onFloorSelect('', '') to reset
    fireEvent.change(buildingSelect, { target: { value: firstBuilding } });
    expect(onFloorSelect).toHaveBeenCalledWith('', '');

    const firstFloor = floorplans[0].floors[0];
    const floorSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    fireEvent.change(floorSelect, { target: { value: firstFloor.name } });
    expect(onFloorSelect).toHaveBeenCalledWith(firstFloor.id, firstFloor.name);

    // Change building — floor dropdown should reset
    const secondBuilding = floorplans[1].building;
    fireEvent.change(buildingSelect, { target: { value: secondBuilding } });
    expect(onFloorSelect).toHaveBeenCalledWith('', '');
  });

  it('renders with correct styling classes', () => {
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);
    const panel = screen.getByText('SELECT LOCATION').closest('div');
    expect(panel).toBeInTheDocument();
  });
});
