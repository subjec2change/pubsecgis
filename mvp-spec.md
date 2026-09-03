# PUSECGIS MVP Spec — Draft 0.1

> **Status:** Draft / Proposal
> **Date:** 2026-09-02
> **Scope:** Barnes-Jewish Hospital Public Safety — Common Operating Picture

---

## 1. Overview

**Goal:** A simple, internal Common Operating Picture (COP) that lets BJC Public Safety officers log incidents, track problem areas/hotspots, and pass shift-to-shift information via a live visual map — broadcast to all satellite offices and ED desks.

**Core Value:** Shift information that doesn't evaporate over the radio. A persistent, visual record of what's happening *right now* across the campus.

---

## 2. Display & Users

### 2.1 Broadcast Screens (6 total — read-only, auto-refreshing)
| Location | Type | Purpose |
|----------|------|---------|
| Main Public Safety Control | TV/Monitor | Primary situational awareness hub |
| Satellite Office #1 | TV/Monitor | Regional status visibility |
| Satellite Office #2 | TV/Monitor | Regional status visibility |
| Satellite Office #3 | TV/Monitor | Regional status visibility |
| Childrens' ED Desk | Monitor | Pediatric ED staff awareness |
| Adult ED Desk | Monitor | Adult ED staff awareness |

### 2.2 Officer Workstations (write-access)
| Role | Access |
|------|--------|
| Floor Rounding Officers | Log incidents, add notes |
| Dispatch | Log incidents, add notes |
| Public Safety Leads | Edit/close incidents, view reports |
| Admin | Manage users, locations, config |

---

## 3. Data Model (MVP Core Tables)

### 3.1 Incident Types & Color Map
| Type | Color | Hex | Meaning |
|------|-------|-----|---------|
| Victim of Violence | 🔴 Red | `#DC2626` | Assault, physical altercations |
| Problematic Patient | 🟡 Yellow | `#D97706` | Behavioral, recurring disturbance |
| Agitated Visitor | 🟠 Orange | `#EA580C` | Family/visitor agitation |
| Patient with Sitter | 🔵 Blue | `#2563EB` | Room sitter assigned (fall risk, suicide risk, etc.) |
| Elopment Patient | 🟢 Green | `#16A34A` | Wandering attempt, elopment alert |
| Hardware / Facility Issue | ⚪ Gray | `#4B5563` | Broken door, camera, lock, alarm |
| General Safety Concern | 🟣 Purple | `#7E22CE` | Suspicious activity, problem area notes |
| Duress Alarm Call | ⬛ Dark Gray | `#1F2937` | Staff duress button triggered |

*(Colors are configurable in Phase 2)*

### 3.2 Core Tables

**`shifts`**
- `id` (PK)
- `shift_date` (date)
- `shift_code` (enum: 'DAY', 'EVE', 'NIGHT')
- `start_time`, `end_time`
- `created_at`

**`incidents`**
- `id` (PK)
- `shift_id` (FK → shifts)
- `incident_type` (enum matching color map above)
- `location_ref` (text — "Building 3, Floor A, Near Nurse Station")
- `description` (text)
- `status` (enum: 'open', 'resolved', 'monitoring')
- `logged_by` (FK → users)
- `created_at`, `updated_at`

**`shift_handoff`**
- `id` (PK)
- `shift_id` (FK → shifts)
- `location_ref` (text, nullable — NULL means building-wide)
- `note` (text)
- `logged_by` (FK → users)
- `created_at`

**`users`**
- `id` (PK)
- `username`, `display_name`
- `role` (officer / dispatch / lead / admin)
- `active` (boolean)

---

## 4. UI Modes

### 4.1 Broadcast Mode (kiosk screen view)
- Fullscreen, no-login required (internal network only)
- **Live map** of campus / floor plan
- **Color-coded markers** for every open incident
- **Auto-refresh** every 30 seconds (polls API for new incidents)
- **Incident sidebar** (scrollable) — latest incidents with type, location, time
- **Shift indicator** — clearly shows which shift is active
- **Filter bar** (optional toggles for type visibility on screen)
- **Kiosk-safe** — fullscreen, prevents normal browser navigation, auto-reloads if it crashes

### 4.2 Officer Mode (data entry)
- Login required (username + password)
- **Map view** with incident plotting
- **Quick log form** — 3 fields max: Type (dropdown), Location (text/search), Description (text)
- **Open/Resolved toggle** — one-click status update
- **Shift handoff note** — text area at bottom, saves per shift
- **Incident list** — chronological feed, filter by type/date/shift
- **Auto-refresh** — 30-second poll for new incidents logged by others

---

## 5. Data Sources & Flow

| Source | Method | Phase |
|--------|--------|-------|
| Floor rounding officers | Manual entry via Officer UI | Phase 1 |
| Dispatch | Manual entry via Officer UI | Phase 1 |
| MTF duress alarms | CSV dump → parser → database | Phase 2 |
| Floor plans | PDF / CAD base map | Phase 1 (PDF) / Phase 2 (CAD overlay) |

---

## 6. Technical Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Backend | Python 3.11, FastAPI | Clean, fast, easy to extend |
| Database | PostgreSQL + PostGIS | Mature, open-source, spatial data ready |
| Frontend (Officer) | React + Leaflet | Map library, component framework, large community |
| Frontend (Broadcast) | React + Leaflet, Kiosk wrapper | Reuses map engine, read-only mode |
| Hosting | Linux server, BJC internal network | Secure, no external dependency |
| Reverse proxy | Nginx | Handles HTTP, static files, routing |
| Auth | Simple JWT or session cookies | Internal only, no SSO needed for MVP |

---

## 7. Implementation Phases

### Phase 1: MVP Core (Weeks 1–3)
- [ ] PostgreSQL + PostGIS setup & seed data
- [ ] FastAPI backend (Incidents, Shifts, Users, Handoff APIs)
- [ ] Officer UI (map + incident entry + filter + handoff)
- [ ] Broadcast UI (fullscreen map + sidebar + 30s auto-refresh)
- [ ] Kiosk mode script (auto-fullscreen, auto-restart)
- [ ] Deploy to BJC internal network

### Phase 2: Enhancements (Weeks 4–6)
- [ ] Duress alarm CSV import & parsing
- [ ] Hotspot heatmap overlay
- [ ] Floor plan overlay (PDF → static map base)
- [ ] Weekly/monthly trend charts (leaderboard view)
- [ ] Exportable reports (PDF/CSV)

### Phase 3: Integration (Weeks 7–10)
- [ ] Duress alarm system API integration (if available)
- [ ] Radio/CAD integration (if available)
- [ ] Mobile-responsive officer UI (tablet-friendly for field officers)
- [ ] Role-based access control (officer vs. lead vs. admin)
- [ ] Audit logging & security hardening

---

## 8. Acceptance Criteria (MVP)

- [ ] Officers can log incidents (type, location, notes)
- [ ] Incidents appear on map in correct colors
- [ ] Broadcast screens show all active incidents with 30s auto-refresh
- [ ] Broadcast screens display at 1920×1080 (no scroll needed for map)
- [ ] Shift handoff notes are captured and visible per shift
- [ ] 6 display targets can view broadcast simultaneously
- [ ] All runs on BJC internal network, no internet dependency
- [ ] CSV duress alarm import works (Phase 2)

---

## 9. Open Questions / TBDs

1. **Exact floor plan sources?** PDFs exist — are high-res CAD files available for better overlay?
2. **MTF CSV format?** What fields does the CSV dump include? (timestamp, location code, event type, etc.)
3. **User roster?** How many active officers/dispatch do we need pre-defined?
4. **Network setup?** Is there a dedicated server slot? Will it be VM or bare metal?
5. **Duress alarm system name?** What brand/vendor handles it now? (Cognosos, kontakt.io, etc.)
6. **Incident severity?** Should each incident have a severity level (1–5) or is simple type enough?
7. **Resolved incidents retention?** How long should resolved incidents stay visible on screens? (24 hrs? 7 days? 30 days?)

---

## 10. Immediate Next Steps

1. **Approve or revise this spec** — adjust anything, add/remove features
2. **Gather floor plan PDFs** — start with Barnes-Jewish main campus
3. **Get sample CSV** — one duress alarm export for format analysis
4. **Confirm server specs** — what BJC IT can provide
5. **Draft wireframes** — visual layout for Officer UI and Broadcast UI

*This is a living draft. We iterate on it.*
