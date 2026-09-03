# PUSECGIS — Concept Brief

> **Status:** MVP scope locked
> **Last updated:** 2026-09-02

## Current thesis

PUSECGIS is an **internal Common Operating Picture (COP) tool** for BJC Healthcare Public Safety that maps incidents, alerts, and problem areas across the Barnes-Jewish Hospital campus and offsite locations — capturing shift-to-shift information that currently gets lost over the radio, and broadcasting a live situational awareness view to all satellite offices.

## Who

- **End users:** BJC Public Safety officers, floor rounding officers, Dispatch
- **Display targets:** Officers' workstations + satellite office screens + ED desk screens
- **Size:** ~5-20 officers per shift, 3 shifts × 24/7
- **Owner:** BJC Public Safety leadership

## Display architecture (critical requirement)

### Mode 1: Data Entry (Officer workstations)
- Interactive map with incident form
- Shift handoff notes
- Filtering by shift, type, department

### Mode 2: Broadcast/Kiosk (Satellite offices + ED desks)
- Full-screen, no-login view
- Live incident markers on campus map
- Auto-refreshing (polls every 30s)
- Color-coded by incident type
- Hotspot heatmap overlay toggle
- Current shift indicators
- Minimal chrome — designed for wall-mounted TV/monitor

### Mode 3: Leadership/Summary (Dashboard view)
- Weekly/monthly trend charts
- Top problem locations
- Shift comparison
- Exportable reports

## Operational context

- **Three shifts:** 0630-1500, 1430-2300, 2230-0700 (overlap periods for handoff)
- **Current workflow:** Manual floor rounding reports + radio/dispatch calls — information evaporates between shifts
- **Goal:** A persistent, map-based record of problem areas, incidents, and alerts that survives shift changes AND is visible on all satellite screens in real-time

## Incident types (from floor rounding)

- Problematic patients
- Victims of violence
- Elopement patients
- Patients with room sitters
- Agitated visitors
- Hardware/facility issues (broken doors, cameras, etc.)
- General safety concerns / "problem area" notes
- Duress alarm calls (from CSV/import)

## MVP features

### Core (shared data layer)
1. **Incident database** — PostgreSQL + PostGIS
2. **REST API** — FastAPI backend serving incidents to both UI modes

### Data Entry UI
3. **Interactive map** — Leaflet/MapLibre with floor plans as base maps
4. **Incident entry form** — type, location (department/room/floor), description, officer, timestamp
5. **Shift handoff notes** — outgoing shift notes tied to locations
6. **Auto-refresh** — 30-second poll for new incidents

### Broadcast/Kiosk Mode
7. **Full-screen incident map** — all current incidents color-coded by type
8. **Live marker updates** — new incidents appear without page refresh
9. **Incident sidebar** — scrollable list of active incidents with type/location/description
10. **Heatmap overlay** — toggle between raw incidents and hotspot view
11. **Shift indicator** — clearly shows which incidents belong to current shift
12. **Kiosk-safe** — no login required, auto-fullscreen, prevents exiting (kiosk mode)

### Data Pipeline
13. **CSV duress alarm import** — automated parser for MTF duress alarm exports (Phase 2)

## Display locations (confirmed)
- Public Safety satellite offices (3 locations)
- ED desk screens
- Main control room (if applicable)

## Out of scope (MVP)
- Real-time duress alarm API integration (CSV dump in Phase 2)
- CAD/radio system integration
- Mobile app (web UI only)
- Multi-facility beyond BJC campus + offsites
- User registration (Phase 2 — start with pre-defined officer list)
