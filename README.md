# PUSECGIS

> Public Safety Emergency Command GIS — a Common Operating Picture (COP) tool that maps incidents, alerts, and problem areas across Barnes-Jewish Hospital campus and broadcasts a live situational view to all satellite offices and ED desks.

**Why it matters:** Shift information currently evaporates over the radio. PUSECGIS creates a persistent, map-based record of what's happening right now across the campus — visible in real-time on six wall-mounted screens simultaneously.

## Quick Start

```bash
# 1. Clone and start everything
git clone https://github.com/subjec2change/pubsecgis.git
cd pubsecgis
docker compose up db

# 2. Start the backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000

# 3. Start the frontend (in another terminal)
cd ../frontend
npm install
npm run dev

# 4. Open http://localhost:5173
```

API docs are live at `http://localhost:8000/docs`.

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Backend** | Python 3.11, FastAPI, SQLAlchemy (async), Pydantic v2 | REST API serving incident data |
| **Database** | PostgreSQL 16 + PostGIS 3.4 | Spatial data, incident geocoding, heatmap queries |
| **Auth** | bcrypt password hashing, JWT tokens (python-jose, HS256) | Officer login, role-based access |
| **Frontend** | React 18, TypeScript, Vite 5, React Router DOM | Interactive map + data-entry UI |
| **Mapping** | Leaflet, leaflet.heat, Recharts | Floorplan overlays, heatmap, trend charts |
| **Testing** | Vitest, React Testing Library | Component & utility tests |
| **Deploy** | Docker Compose, Nginx, Chrome Kiosk, systemd | BJC internal network, 6 broadcast screens |

## Project Structure

```
PUBSECGIS/
├── backend/                       # FastAPI REST API
│   ├── main.py                    # App factory, CORS, router registration, lifespan
│   ├── config.py                  # Pydantic-settings (env vars with PUBSECGIS_ prefix)
│   ├── dependencies.py            # Auth deps, token helpers
│   ├── models/
│   │   ├── database.py            # SQLAlchemy async engine, session, ORM models
│   │   └── schemas.py             # Pydantic request/response schemas
│   ├── crud/
│   │   ├── incidents.py           # Incident CRUD + auto-archive background task
│   │   ├── handoff.py             # Handoff note CRUD
│   │   ├── locations.py           # Location search & autocomplete
│   │   └── users.py               # User lookup helpers
│   ├── routes/
│   │   ├── auth.py                # POST /login, GET /me
│   │   ├── incidents.py           # CRUD + response-phases endpoint
│   │   ├── analytics.py           # Heatmap, trends, CSV export
│   │   ├── broadcast.py           # Read-only incidents for kiosk screens
│   │   ├── handoff.py             # Shift handoff notes
│   │   ├── locations.py           # Location search / autocomplete
│   │   ├── shifts.py              # Shift listing + auto-create by code/date
│   │   └── users.py               # User listing (active only)
│   ├── tests/                     # Backend tests
│   └── requirements.txt
├── frontend/                      # React/Vite SPA
│   ├── src/
│   │   ├── App.tsx                # Router setup, view routing
│   │   ├── main.tsx               # React entry point
│   │   ├── api/                   # Axios client + API endpoint constants
│   │   ├── components/            # React components
│   │   │   ├── BroadcastPage.tsx  # Full-screen read-only map view
│   │   │   ├── IncidentForm.tsx  # Quick incident entry (3 fields max)
│   │   │   ├── OfficerMap.tsx    # Interactive map with Leaflet markers
│   │   │   ├── OfficerPage.tsx   # Officer dashboard (map + sidebar + form)
│   │   │   ├── FloorplanSelector.tsx  # Building/floor plan overlay
│   │   │   ├── TrendsTab.tsx     # Recharts trend charts
│   │   │   ├── Sidebar.tsx       # Scrollable incident list
│   │   │   ├── Login.tsx         # Authentication form
│   │   │   ├── ShiftSelector.tsx # Current-shift picker
│   │   │   ├── ViewSwitcher.tsx  # Officer / Broadcast toggle
│   │   │   └── __tests__/        # Vitest component tests
│   │   ├── context/AuthContext.tsx  # Auth state provider
│   │   ├── data/floorplans.json     # Legacy design reference; runtime registry is API-backed
│   │   ├── types/index.ts            # Shared TypeScript types
│   │   └── utils/incident-coords.ts  # Floorplan-to-map coordinate mapping
│   ├── package.json
│   └── vite.config.ts
├── database/
│   ├── migrations/
│   │   └── 001_initial_schema.sql  # 4 tables: users, shifts, locations, incidents, handoff_notes
│   └── seeds/
│       └── 001_seed_data.sql       # Initial seed data
├── scripts/
│   ├── kiosk-launch.sh             # Chrome kiosk launcher with auto-restart loop
│   ├── pusecgis-kiosk.service      # systemd service unit for broadcast screens
│   └── seed_incidents.py           # Incident seeding utility
├── docs/
│   ├── DEPLOYMENT.md               # Full deployment guide (systemd, Nginx, kiosk setup)
│   └── plans/
│       ├── 2026-09-14-floorplan-system.md
│       ├── 2026-09-14-incident-map-plotting-design.md
│       └── 2026-09-14-incident-map-plotting.md
├── docker-compose.yml              # PostgreSQL 16 + PostGIS container
├── .gitignore
├── CODEOWNERS
├── mvp-spec.md                     # Full MVP specification (draft 0.1)
├── pusecgis-mvp.pdf                # PDF version of the MVP spec
├── mvp-spec.json                   # Structured JSON spec
├── pdf-spec.json                   # PDF generation spec
├── IDEA.md                         # Original concept notes
├── concept-brief.md                # Current concept brief & operational context
├── session-transcript.md           # Brainstorming session transcript
├── research-ledger.md              # Research findings & competitive landscape
└── PROJECT_RUNBOOK.md              # Project runbook
```

## API Endpoints

All endpoints are prefixed with `/api`. OpenAPI auto-docs at `/docs`.

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | None | Authenticate with `{username, password}` → returns JWT access token + user info |
| `GET` | `/api/auth/me` | Bearer JWT | Return current authenticated user profile |

### Incidents

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/incidents` | None | List incidents; filter by `status`, `type`, `date`, `location`, `shift` |
| `POST` | `/api/incidents` | Bearer JWT | Create a new incident (type, location, description, lat/lng, response phase) |
| `PUT` | `/api/incidents/{id}` | Lead/Admin | Update an incident's type, location, status, response phase |
| `DELETE` | `/api/incidents/{id}` | Admin | Delete an incident |
| `GET` | `/api/incidents/response-phases` | None | Return available response phase options with labels |

### Floorplans and incident-local pins

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/floorplans` | None | Search active registry-backed floorplan sheets; each row identifies its current immutable version |
| `POST` | `/api/floorplans` | Admin | Register a floorplan sheet and create version 1 |
| `DELETE` | `/api/floorplans/{floor_id}` | Admin | Deactivate/remove a floorplan registry row |
| `GET` | `/api/incidents/{id}/floorplan-history` | Lead/Admin | Read immutable prior floorplan pin states |

Incident create/update payloads may include an exact `floorplan_version_id`, normalized `floorplan_x`/`floorplan_y` coordinates, and an optional room label. Later pin changes preserve the previous state and require a reason.

### Shift reports

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/reports/shift` | Lead/Admin | Return the selected or most recently ended shift report as JSON |
| `GET` | `/api/reports/shift?date=YYYY-MM-DD&code=DAY&format=pdf` | Lead/Admin | Download the selected shift report as a PDF |

Reports include incident totals, per-type and per-officer breakdowns, timeline data, handoff notes, and floorplan pin detail where present.

### Analytics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/incidents/heatmap` | None | Return `{lat, lng, intensity}` points within radius for heatmap rendering |
| `GET` | `/api/incidents/trends` | None | Time-series counts grouped weekly or monthly, with `by_type` breakdown |
| `GET` | `/api/incidents/export.csv` | Lead/Admin | CSV download of incidents with optional date/status filters |

### Broadcast (Read-Only)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/broadcast/incidents` | None | All open/escalating/monitoring incidents with color config — for kiosk screens |
| `GET` | `/api/broadcast/config` | None | Incident type color map (8 types with hex colors and labels) |

### Shifts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/shifts` | Bearer JWT | List shifts, optional `date` filter |
| `POST` | `/api/shifts` | Bearer JWT | Get or create a shift by code (`DAY`, `EVE`, `NIGHT`) and date (idempotent) |

### Handoff Notes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/handoff/notes` | Bearer JWT | List handoff notes, filter by `shift` or `date` |
| `POST` | `/api/handoff/notes` | Bearer JWT | Create a shift handoff note |

### Locations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/locations` | None | Search locations (autocomplete via `q` param) or list all |

### Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/users` | None | List all active users |

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | None | Health check — returns `healthy` + version + DB status |

## Incident Types & Color Map

| Type | Color | Hex | Use Case |
|------|-------|-----|----------|
| Victim of Violence | 🔴 Red | `#DC2626` | Assault, physical altercations |
| Problematic Patient | 🟡 Yellow | `#D97706` | Behavioral, recurring disturbance |
| Agitated Visitor | 🟠 Orange | `#EA580C` | Family/visitor agitation |
| Patient with Sitter | 🔵 Blue | `#2563EB` | Room sitter assigned (fall/suicide risk) |
| Elopement Patient | 🟢 Green | `#16A34A` | Wandering attempt, elopment alert |
| Hardware / Facility Issue | ⚪ Gray | `#4B5563` | Broken door, camera, lock, alarm |
| General Safety Concern | 🟣 Purple | `#7E22CE` | Suspicious activity, problem area notes |
| Duress Alarm Call | ⬛ Dark Gray | `#1F2937` | Staff duress button triggered |

## Database Schema

Four core tables initialized by `database/migrations/001_initial_schema.sql`:

- **`users`** — Officer accounts with roles (officer, dispatch, lead, admin), bcrypt password hashes
- **`shifts`** — DAY / EVE / NIGHT shifts with time windows and dates
- **`locations`** — Hospital locations with PostGIS geography POINT for geocoding
- **`incidents`** — Incident records linked to shifts/locations/users, with PostGIS geometry, status enum, and auto-archive support
- **`handoff_notes`** — Shift-to-shift handoff notes tied to shifts and locations

## UI Modes

**Officer Mode** — Authenticated data entry. Interactive Leaflet map, 3-field incident form, shift handoff notes, incident list sidebar, auto-refresh every 30s.

**Broadcast / Kiosk Mode** — Read-only full-screen map on wall monitors. Auto-refreshes every 30s, color-coded markers, incident sidebar, no login required. Uses `scripts/kiosk-launch.sh` for Chrome fullscreen mode with auto-restart.

6 display targets: Main Control (1) + 3 Satellite Offices + Children's ED (1) + Adult ED (1).

## Development

### Backend (FastAPI)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Start dev server (auto-reload)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Run tests
python -m pytest tests/
```

### Frontend (React/Vite)

```bash
cd frontend
npm install

# Dev server with HMR
npm run dev

# Build for production
npm run build

# Run tests
npm run test
```

### Full Stack with Docker

```bash
# Start PostgreSQL + PostGIS only (run backend/frontend separately)
docker compose up db

# Or for a complete environment (DB only — frontend/backend still need manual start)
docker compose up -d
```

### Kiosk Deployment (Production)

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for full systemd/Nginx/Chrome kiosk setup across 6 screens.

## Documentation

| Document | Description |
|----------|-------------|
| [mvp-spec.md](mvp-spec.md) | Full MVP specification (draft 0.1) — data model, UI modes, phases, acceptance criteria |
| [pusecgis-mvp.pdf](pusecgis-mvp.pdf) | PDF version of the MVP spec |
| [mvp-spec.json](mvp-spec.json) | Structured JSON version of the MVP spec |
| [concept-brief.md](concept-brief.md) | Current concept brief, operational context, display architecture |
| [IDEA.md](IDEA.md) | Original project concept notes |
| [session-transcript.md](session-transcript.md) | Brainstorming session transcript |
| [research-ledger.md](research-ledger.md) | Research findings, competitive landscape |
| [PROJECT_RUNBOOK.md](PROJECT_RUNBOOK.md) | Project runbook |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment guide (systemd, Nginx, kiosk screens) |
| [docs/plans/](docs/plans/) | Design docs and implementation plans |

## Implementation Phases

| Phase | Timeline | Status |
|-------|----------|--------|
| **Phase 1: MVP Core** | Weeks 1–3 | Implemented — incidents, shifts, users, handoff, officer UI, broadcast UI, kiosk mode, Docker |
| **Phase 2: Enhancements** | Weeks 4–6 | Mostly implemented — heatmaps, trend charts, CSV export, Shift Reports v1/v2, registry-backed floorplans and incident-local pin history; duress CSV remains blocked on sample input |
| **Phase 3: Integration** | Weeks 7–10 | Not started — duress alarm API, CAD/radio integration, mobile-responsive field UI, audit-log expansion |

## License

This project is intended for internal use by Barnes-Jewish Hospital (BJC Healthcare).
