# Incident Map Plotting and Heatmap Alignment Implementation Plan

> **For implementer:** Use TDD throughout. Write each failing test first, watch it fail, then implement the smallest change.

**Goal:** Persist incident coordinates from map clicks or known locations and use one active incident set and coordinate resolver for sidebar, markers, and heatmap.

**Architecture:** Add optional latitude/longitude to the incident API contract and persist PostGIS geometry at the backend boundary. Pass an explicit placement callback from `OfficerPage` through `OfficerMap` and `IncidentForm`; use a shared deterministic fallback only when no real coordinate exists. Limit active visualization to open, monitoring, and escalating incidents.

**Tech Stack:** FastAPI, SQLAlchemy/GeoAlchemy2, PostgreSQL/PostGIS, React 18, TypeScript, Leaflet, leaflet.heat, pytest.

---

### Task 1: Backend coordinate contract

**Files:**
- Modify: `backend/models/schemas.py`
- Modify: `backend/crud/incidents.py`
- Modify: `backend/routes/incidents.py`
- Test: `backend/tests/test_incident_coordinates.py`

**Steps:**
1. Add failing tests for create/update accepting optional latitude/longitude and producing a PostGIS point.
2. Run `pytest backend/tests/test_incident_coordinates.py -q`; confirm failure.
3. Implement validation for latitude [-90,90] and longitude [-180,180], and persist `geom` using `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` when coordinates are present.
4. Return latitude/longitude from incident responses by extracting them from geometry or stored coordinate fields.
5. Run the focused test and confirm pass.
6. Commit: `feat: persist incident map coordinates`.

### Task 2: Known-location coordinate precedence

**Files:**
- Modify: `backend/routes/incidents.py`
- Modify: `backend/crud/incidents.py`
- Test: `backend/tests/test_incident_coordinates.py`

**Steps:**
1. Add failing tests proving known location coordinates take precedence over explicit map coordinates, and map coordinates are used when the known location has none.
2. Run the focused tests and confirm failure.
3. Resolve coordinates in the backend using known location data first, then explicit coordinates.
4. Run the focused tests and confirm pass.
5. Commit: `feat: resolve known incident locations`.

### Task 3: Frontend placement state and form workflow

**Files:**
- Modify: `frontend/src/components/OfficerPage.tsx`
- Modify: `frontend/src/components/OfficerMap.tsx`
- Modify: `frontend/src/components/IncidentForm.tsx`
- Modify: `frontend/src/api/endpoints.ts`
- Modify: `frontend/src/types.ts`
- Test: `frontend/src/components/__tests__/incident-placement.test.tsx`

**Steps:**
1. Add failing tests for `Set location on map`, placement mode, temporary marker, coordinate display, and coordinate payload submission.
2. Run the frontend test command used by the repository; confirm failure.
3. Add placement state at page level, pass a placement callback to the map, and pass selected coordinates into the form.
4. Add the form action and submit latitude/longitude for create/update.
5. Run focused tests and confirm pass.
6. Commit: `feat: add map-click incident placement`.

### Task 4: Unified marker and heatmap coordinates

**Files:**
- Modify: `frontend/src/components/OfficerMap.tsx`
- Test: `frontend/src/components/__tests__/incident-coordinates.test.ts`

**Steps:**
1. Add a failing test proving the marker and fallback heatmap resolve the same coordinates for a given incident.
2. Run the focused test and confirm failure.
3. Extract a shared coordinate resolver: real incident coordinates first, otherwise deterministic incident-ID fallback. Use it for both marker and heatmap points.
4. Filter both paths to open, monitoring, and escalating incidents.
5. Keep the legend visible until the heatmap is disabled.
6. Run focused tests and confirm pass.
7. Commit: `fix: align incident markers and heatmap points`.

### Task 5: Sidebar/map active-set consistency

**Files:**
- Modify: `frontend/src/components/OfficerPage.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Test: `frontend/src/components/__tests__/active-incidents.test.tsx`

**Steps:**
1. Add a failing test showing all loaded active incidents are passed to both sidebar and map while presentation pagination does not remove map points.
2. Run the focused test and confirm failure.
3. Centralize active-status filtering and ensure map receives the complete filtered collection.
4. Run focused tests and confirm pass.
5. Commit: `fix: keep sidebar and map active incidents consistent`.

### Task 6: Rebuild, restart, and live verification

**Files:**
- No source changes expected.

**Steps:**
1. Run backend tests and frontend build.
2. Stop stale Vite/Uvicorn processes without touching unrelated services.
3. Start backend on port 8000 and frontend on port 5173.
4. Verify health endpoints and create a test incident through the UI/API.
5. Verify the incident appears in the sidebar, marker, and heatmap at the same coordinate.
6. Capture command output or screenshot evidence.
7. Commit only if all checks pass: `chore: verify incident plotting and heatmap`.
