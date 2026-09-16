import { useState, useMemo } from 'react';
import floorplans from '../data/floorplans.json';

interface FloorplanSelectorProps {
  onFloorSelect: (floorId: string, floorName: string) => void;
}

export default function FloorplanSelector({ onFloorSelect }: FloorplanSelectorProps) {
  const [selectedBuilding, setSelectedBuilding] = useState<string>('');
  const [selectedFloor, setSelectedFloor] = useState<string>('');

  const buildings = useMemo(() => floorplans.map((b) => b.building), []);

  const floors = useMemo(() => {
    if (!selectedBuilding) return [];
    const building = floorplans.find((b) => b.building === selectedBuilding);
    return building?.floors.map((f) => f.name) || [];
  }, [selectedBuilding]);

  const handleBuildingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const building = e.target.value;
    setSelectedBuilding(building);
    setSelectedFloor('');
    onFloorSelect('', '');
  };

  const handleFloorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const floorName = e.target.value;
    setSelectedFloor(floorName);
    const building = floorplans.find((b) => b.building === selectedBuilding);
    const floor = building?.floors.find((f) => f.name === floorName);
    if (floor) {
      onFloorSelect(floor.id, floor.name);
    }
  };

  return (
    <div style={{
      background: 'rgba(11, 18, 25, 0.95)',
      border: '1px solid var(--border)',
      padding: '0.75rem 1rem',
      borderRadius: '6px',
      fontFamily: "'IBM Plex Sans', sans-serif",
      width: '280px',
    }}>
      <div style={{
        fontWeight: 600,
        color: 'var(--text-bright)',
        marginBottom: '0.5rem',
        fontSize: '0.75rem',
        letterSpacing: '0.1em',
      }}>
        SELECT LOCATION
      </div>

      <select
        value={selectedBuilding}
        onChange={handleBuildingChange}
        style={{
          width: '100%',
          marginBottom: '0.5rem',
          padding: '0.4rem',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          color: 'var(--text-bright)',
          fontSize: '0.8rem',
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
      >
        <option value="">— Select Building —</option>
        {buildings.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>

      {selectedBuilding && (
        <select
          value={selectedFloor}
          onChange={handleFloorChange}
          style={{
            width: '100%',
            padding: '0.4rem',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text-bright)',
            fontSize: '0.8rem',
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          <option value="">— Select Floor —</option>
          {floors.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      )}
    </div>
  );
}
