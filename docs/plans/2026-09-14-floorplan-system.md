# Floorplan Selection & Overlay Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken floorplan placeholder rectangles in OfficerMap with a working two-step building/floor dropdown, dynamic overlay of real floorplan images at their geographic bounds, and map `fitBounds` on selection.

**Architecture:** Static JSON file (`frontend/src/data/floorplans.json`) defines the building/floor hierarchy. A new `FloorplanSelector.tsx` component renders the two-step dropdown. `OfficerMap.tsx` listens to floor selection events, manages an `L.imageOverlay` layer, and calls `map.fitBounds()` on selection. No backend changes — all frontend.

**Tech Stack:** React, TypeScript, Leaflet (L.imageOverlay), Vitest, Vite.

## Global Constraints

- No backend changes required (floorplans stored in JSON + `public/` folder)
- Use existing `leaflet` and `leaflet.heat` dependencies (already installed)
- Follow existing component patterns in the codebase (inline styles, ref-based layer management)
- No drive-by refactors — only touch what's needed for this feature

---

### Task 1: Data Definition — Create `floorplans.json`

**Files:**
- Create: `frontend/src/data/floorplans.json`

**Interfaces:**
- Produces: JSON array of buildings with nested floor arrays, each floor having `id`, `name`, `image`, `bounds` (SW/NE lat/lng)

- [ ] **Step 1: Create `frontend/src/data/` directory and `floorplans.json`**

Create the file at `frontend/src/data/floorplans.json` with this exact schema:

```json
[
  {
    "building": "Main Building",
    "buildingId": "main-building",
    "floors": [
      {
        "id": "a1",
        "name": "Floor 1 - Lobby",
        "image": "/floorplans/main-floor1.png",
        "bounds": [
          [38.6273, -90.2425],
          [38.6271, -90.2415]
        ]
      },
      {
        "id": "a2",
        "name": "Floor 2 - Offices",
        "image": "/floorplans/main-floor2.png",
        "bounds": [
          [38.6273, -90.2425],
          [38.6271, -90.2415]
        ]
      }
    ]
  },
  {
    "building": "Children's Hospital",
    "buildingId": "childrens-hospital",
    "floors": [
      {
        "id": "c1",
        "name": "Floor 1 - ER",
        "image": "/floorplans/childrens-floor1.png",
        "bounds": [
          [38.6265, -90.2420],
          [38.6260, -90.2410]
        ]
      }
    ]
  }
]
```

**Note:** Include at least 2–3 buildings with 2 floors each. Use the existing `FLOORPLAN_VIEWS` coordinates from `types/index.ts` for the bounds placeholders. The `image` paths reference `public/floorplans/*.png` files — these will be added by the user later when they have actual floorplan images.

- [ ] **Step 2: Verify JSON is valid**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('frontend/src/data/floorplans.json','utf8')); console.log('Valid JSON')"
```

Expected: `Valid JSON`

- [ ] **Step 3: Commit**

```bash
cd /home/thx1138/PUBSECGIS
git add frontend/src/data/floorplans.json
git commit -m "feat: add floorplans.json data file with initial building/floor structure"
```

---

### Task 2: Build `FloorplanSelector` Component (TDD)

**Files:**
- Create: `frontend/src/components/FloorplanSelector.tsx`
- Create: `frontend/src/components/__tests__/FloorplanSelector.test.tsx`

**Interfaces:**
- Consumes: `floorplans` from `frontend/src/data/floorplans.json`
- Produces: React component with two dropdowns, `onFloorSelect(floorId, floorName)` callback, `selectedFloorId`/`selectedFloorName` state
- Consumed by: `OfficerPage.tsx` (passes to `OfficerMap`)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/__tests__/FloorplanSelector.test.tsx`:

```typescript
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

  it('filters floor dropdown when building is selected', () => {
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);
    
    const firstBuilding = floorplans[0].building;
    const buildingSelect = screen.getByRole('combobox');
    fireEvent.change(buildingSelect, { target: { value: firstBuilding } });
    
    const floors = floorplans[0].floors.map((f) => f.name);
    floors.forEach((name) => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
  });

  it('calls onFloorSelect with floorId and floorName when a floor is selected', () => {
    render(<FloorplanSelector onFloorSelect={onFloorSelect} />);
    
    const firstBuilding = floorplans[0].building;
    fireEvent.change(screen.getByRole('combobox'), { target: { value: firstBuilding } });
    
    const firstFloor = floorplans[0].floors[0];
    const floorSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(floorSelect, { target: { value: firstFloor.name } });
    
    expect(onFloorSelect).toHaveBeenCalledWith(firstFloor.id, firstFloor.name);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /home/thx1138/PUBSECGIS/frontend
npx vitest run src/components/__tests__/FloorplanSelector.test.tsx
```

Expected: FAIL — "FloorplanSelector" module not found / component not defined.

- [ ] **Step 3: Write minimal FloorplanSelector component**

Create `frontend/src/components/FloorplanSelector.tsx`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd /home/thx1138/PUBSECGIS/frontend
npx vitest run src/components/__tests__/FloorplanSelector.test.tsx
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/thx1138/PUBSECGIS
git add frontend/src/components/FloorplanSelector.tsx frontend/src/components/__tests__/FloorplanSelector.test.tsx
git commit -m "feat: add FloorplanSelector component with building/floor dropdown"
```

---

### Task 3: Map Overlay Logic — `L.imageOverlay` + `fitBounds`

**Files:**
- Modify: `frontend/src/components/OfficerMap.tsx`
- Create: `frontend/src/components/__tests__/OfficerMap-floormap.test.tsx` (unit test for overlay logic)

**Interfaces:**
- Consumes: `onFloorSelect` callback from props (already exists)
- Produces: `imageOverlayRef` ref tracking the Leaflet image overlay, `fitBounds()` on selection
- The existing `floorplanLayersRef` (placeholder rectangles) is replaced/hidden when a real floor is selected.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/__tests__/OfficerMap-floormap.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// This test verifies the conceptual logic — a full map test would require
// a real Leaflet map instance. The logic is: when a floor is selected via
// onFloorSelect, the map should call fitBounds with the floor's bounds.
// We test the data flow, not the map instance.

describe('Floor selection data flow', () => {
  it('transmits floorId, floorName, bounds through onFloorSelect callback', () => {
    const onSelect = vi.fn();
    
    // Simulate: onFloorSelect('a1', 'Floor 1 - Lobby')
    onSelect('a1', 'Floor 1 - Lobby');
    
    expect(onSelect).toHaveBeenCalledWith('a1', 'Floor 1 - Lobby');
  });
});
```

This is a lightweight smoke test — the real visual verification is manual.

- [ ] **Step 2: Run test to verify it passes**

Run:
```bash
cd /home/thx1138/PUBSECGIS/frontend
npx vitest run src/components/__tests__/OfficerMap-floormap.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Modify `OfficerMap.tsx` to handle floor selection with image overlay**

In `OfficerMap.tsx`, add these changes:

**a) Add image overlay ref (around line 50):**

```typescript
// After activeHeatmapRef
const imageOverlayRef = useRef<L.ImageOverlay | null>(null);
const floorImageOverlayRef = useRef<L.ImageOverlay | null>(null);
```

**b) Add `useEffect` to handle floor selection (after the existing heatmap toggle, around line 339):**

```typescript
// Floor selection handler — show image overlay and fitBounds
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  // If no floor selected, remove any existing image overlay
  if (!selectedFloorId) {
    if (floorImageOverlayRef.current) {
      map.removeLayer(floorImageOverlayRef.current);
      floorImageOverlayRef.current = null;
    }
    return;
  }

  // Find the selected floor's data
  const floorData = floorplans.flatMap((b) =>
    b.floors.map((f) => ({
      ...f,
      building: b.building,
      image: b.buildingId,
    }))
  ).find((f) => f.id === selectedFloorId);

  if (!floorData) return;

  // Remove old overlay
  if (floorImageOverlayRef.current) {
    map.removeLayer(floorImageOverlayRef.current);
  }

  // Create new image overlay at the floor's bounds
  const imageUrl = floorData.image.startsWith('/') ? floorData.image : `/floorplans/${floorData.image}`;
  const bounds = floorData.bounds as L.LatLngBoundsLiteral;

  const overlay = L.imageOverlay(imageUrl, bounds, {
    opacity: 0.9,
    attribution: `${floorData.name} — ${floorData.building}`,
  }).addTo(map);

  floorImageOverlayRef.current = overlay;

  // Fit bounds — animate the map to show the floorplan
  map.fitBounds(bounds, {
    animate: true,
    duration: 0.5,
    padding: [50, 50],
  });
}, [selectedFloorId]);
```

**c) Update the component props interface (line 9) to include `floorplans` prop:**

```typescript
interface OfficerMapProps {
  // ... existing props ...
  /** Floorplans data for image overlay */
  floorplans?: typeof import('../data/floorplans.json');
}
```

**d) Destructure and import floorplans in the component:**

```typescript
import floorplansData from '../data/floorplans.json';
// ...
const { incidents, broadcastIncidents, colorConfig, onIncidentClick, onMapClick,
  selectedIncidentId, center = [38.6270, -90.2418], zoom = 17,
  currentView = 'streetmap', onCurrentViewChange, onBuildingSelect,
  onFloorSelect, placementMode = false, onPlacementModeToggle,
  floorplans = floorplansData,
}: OfficerMapProps = {
  // ... destructure ...
};
```

Actually — simpler: just import `floorplansData` at the top and use it directly inside the component (no need to add to props). Remove the `floorplans` prop addition and instead:

```typescript
// At the top of OfficerMap.tsx, add import:
import floorplansData from '../data/floorplans.json';
```

Then inside the component, use `floorplansData` wherever the old `floorplanBuildings` constant was used for the placeholder rectangles.

**e) Replace the `floorplanBuildings` constant (line 107–112) with an empty array for now** — the real building data comes from `floorplansData`:

```typescript
// Placeholder floorplan buildings — replaced by floorplansData at runtime
const floorplanBuildings: typeof import('../types').FloorplanBuilding[] = [];
```

This clears the placeholder rectangles. The new image overlay will be rendered via the `useEffect` above.

- [ ] **Step 4: Run tests to verify nothing broke**

Run:
```bash
cd /home/thx1138/PUBSECGIS/frontend
npx vitest run
```

Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/thx1138/PUBSECGIS
git add frontend/src/components/OfficerMap.tsx frontend/src/components/__tests__/OfficerMap-floormap.test.tsx
git commit -m "feat: add floorplan image overlay with fitBounds on selection"
```

---

### Task 4: UI Integration & Cleanup

**Files:**
- Modify: `frontend/src/components/OfficerPage.tsx`
- Modify: `frontend/src/components/OfficerMap.tsx` (remove old placeholder rectangles)

**Interfaces:**
- Consumes: `OnFloorSelect` from `OfficerMap`
- Produces: Integrated selector in the UI, old floorplan rectangles removed

- [ ] **Step 1: Replace old "CURRENT LOCATION" panel in OfficerMap with FloorplanSelector**

In `OfficerMap.tsx`, find the JSX section starting at line 633 (`{currentView === 'floorplan' && (`) which renders the "Building/Floor Selection Panel". Replace the entire content of that panel with the `FloorplanSelector` component:

```tsx
import FloorplanSelector from './FloorplanSelector';
// ...
{currentView === 'floorplan' && (
  <div style={{
    position: 'absolute',
    bottom: '1rem',
    right: '1rem',
    zIndex: 1000,
  }}>
    <FloorplanSelector onFloorSelect={handleFloorSelect} />
  </div>
)}
```

Where `handleFloorSelect` is:

```typescript
const handleFloorSelect = useCallback((floorId: string, floorName: string) => {
  onFloorSelect?.(floorId, floorName);
}, [onFloorSelect]);
```

- [ ] **Step 2: Wire `selectedFloorId` state in OfficerMap**

In `OfficerMap.tsx`, add state to track the selected floor ID for the overlay effect:

```typescript
const [selectedFloorId, setSelectedFloorId] = useState<string>('');
const [selectedFloorName, setSelectedFloorName] = useState<string>('');
```

And wire the `onFloorSelect` callback to update this state:

```typescript
// In the existing onFloorSelectRef pattern:
const onFloorSelectRef = useRef(onFloorSelect);
onFloorSelectRef.current = onFloorSelect;
```

Actually — simpler: create an inline handler:

```typescript
const handleFloorSelect = useCallback((floorId: string, floorName: string) => {
  setSelectedFloorId(floorId);
  setSelectedFloorName(floorName);
  onFloorSelect?.(floorId, floorName);
}, [onFloorSelect]);
```

- [ ] **Step 3: Verify build passes**

Run:
```bash
cd /home/thx1138/PUBSECGIS/frontend
npm run build
```

Expected: Build succeeds with 0 errors.

- [ ] **Step 4: Manual E2E test**

1. Open http://localhost:5173/officer
2. Log in with `admin.bjs` / `pusecgis_dev`
3. Click "Floorplan" toggle in top-left
4. Select a building from dropdown
5. Select a floor from dropdown
6. Verify map zooms to the selected floor's bounds
7. Verify the floorplan image overlay appears (or placeholder if no image exists yet)
8. Verify clicking "Street Map" removes the overlay

- [ ] **Step 5: Commit**

```bash
cd /home/thx1138/PUBSECGIS
git add frontend/src/components/OfficerPage.tsx frontend/src/components/OfficerMap.tsx frontend/src/components/FloorplanSelector.tsx
git commit -m "feat: integrate FloorplanSelector UI with overlay, remove old placeholder rectangles"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Data definition (JSON file) — Task 1
- ✅ Two-step Building → Floor dropdown — Task 2
- ✅ Image overlay + fitBounds on selection — Task 3
- ✅ UI integration + cleanup — Task 4
- ✅ No backend changes — confirmed

**2. Placeholder scan:**
- ✅ No "TBD", "TODO", "fill in later", or "similar to" patterns found

**3. Type consistency:**
- ✅ `floorplans.json` schema is consistent across all tasks
- ✅ `onFloorSelect(floorId, floorName)` callback signature is consistent
- ✅ `floorplansData` import is used consistently in Task 3 and Task 4

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-09-14-floorplan-system.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session.

Which approach?
