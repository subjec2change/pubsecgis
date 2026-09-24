# PUSECGIS Project Runbook

This document serves as the authoritative guide for developers and AI agents working on the PUSECGIS project. It defines the specialized skills, the agency roster, and the mandatory operational flows.

## 🛠 Specialized Skillset

### Core Project Skills
- **`pusecgis-workflow`**: Optimized patterns for Dashboard, Kiosk, and Broadcast UI development.
- **`session-offload`**: **CRITICAL.** Use proactively at ~75–80% context capacity, after a compression/too-long error, or at a phase boundary. Saves loaded skills, agency rosters, and project state to Hermes Memory, MemPalace, Obsidian, and the Session Diary to ensure zero loss during handoffs.

### Development Lifecycle Skills
- **`superpowers`**: The master workflow (Spec $\rightarrow$ TDD $\rightarrow$ Subagent).
- **`writing-plans`** & **`to-tickets`**: Used to decompose high-level features into verifiable, independent tasks.
- **`test-driven-development` (TDD)**: Mandatory for all logic and API changes.
- **`verification-before-completion`**: Requires physical evidence (logs, screenshots, test outputs) before a task is marked complete.
- **`systematic-debugging`**: 4-phase root cause analysis for hard regressions.

---

## 🤖 Agency Agent Roster (PUSECGIS Specialists)

**Location:** `.opencode/agents/` directory (24 agents deployed)

When delegating via `agents-orchestrator`, use these scoped specialists:

### Core (3)
| Agent | Role | Primary Focus |
| :--- | :--- | :--- |
| **agents-orchestrator** | Lead/Conductor | Pipeline management, task decomposition, delegation. |
| **specialized-master-plan-architect** | System Design | Multi-agent orchestration strategy & failure handling. |
| **project-management-project-shepherd** | Coordination | Managing Human-In-The-Loop (HITL) gates, progress tracking. |

### Frontend & Design (5)
| Agent | Role | Primary Focus |
| :--- | :--- | :--- |
| **engineering-frontend-developer** | UI Specialist | React, Vite, Leaflet, IBM Plex. |
| **engineering-rapid-prototyper** | Prototyping | Throwaway UI/feature validation. |
| **design-ux-architect** | UX Design | Information architecture, user flows. |
| **design-ux-researcher** | Research | User testing, feedback analysis. |
| **design-ui-designer** | Visual Design | Component styling, theme consistency. |

### Backend & Data (4)
| Agent | Role | Primary Focus |
| :--- | :--- | :--- |
| **engineering-backend-architect** | API/Logic | FastAPI, PostgreSQL, JWT/Auth. |
| **engineering-database-optimizer** | Spatial DB | PostGIS indexing, query efficiency. |
| **engineering-devops-automator** | Deployment | Docker, Nginx, Kiosk/systemd. |
| **engineering-technical-writer** | Documentation | API docs, inline comments, README. |

### GIS Specialists (4)
| Agent | Role | Primary Focus |
| :--- | :--- | :--- |
| **gis-web-gis-developer** | Map Integration | MapLibre/Leaflet & REST GIS layers. |
| **gis-analyst** | Spatial Logic | Incident mapping, spatial queries. |
| **gis-spatial-data-engineer** | ETL | Duress CSV & GeoJSON processing. |
| **gis-cartography-designer** | Visuals | Heatmap styling, map aesthetics. |
| **gis-qa-engineer** | Spatial QA | CRS validation, topology integrity. |

### Testing & QA (5)
| Agent | Role | Primary Focus |
| :--- | :--- | :--- |
| **engineering-code-reviewer** | Review | Code quality, security scan, spec compliance. |
| **testing-api-tester** | API Testing | FastAPI endpoint & security testing. |
| **testing-performance-benchmarker** | Performance | Load testing, Core Web Vitals. |
| **testing-reality-checker** | Integration | End-to-end validation. |
| **testing-evidence-collector** | Visual QA | Screenshot QA, issue logging. |

### Documentation (2)
| Agent | Role | Primary Focus |
| :--- | :--- | :--- |
| **engineering-technical-writer** | Documentation | API docs, inline comments, README. |
| **engineering-universal-document-compiler** | Documentation Aggregation | Consolidates all documentation outputs. |
| **Project Shepherd** | Coordination | Managing Human-In-The-Loop (HITL) gates. |
| **MAS Architect** | System Design | Pipeline recovery & failure handling. |

---

## 🚀 Standard Operating Procedure (SOP)

### The "Main Flow" (Idea $\rightarrow$ Ship)
1.  **Sharpen**: Use **`/grill-with-docs`** to refine the idea. This populates `CONTEXT.md`.
2.  **Decide**: If the idea is complex, use **`/prototype`** to settle design questions.
3.  **Structure**: Use **`/to-spec`** followed by **`/to-tickets`**.
4.  **Execute**: Implement via **`/implement`** using the **`superpowers`** (TDD + Subagents) approach.
5.  **Validate**: Run **`/code-review`** and **`/verification-before-completion`**.

### Context Management
- **Do not work in a degraded window.** If the model stops reasoning sharply, use **`/compact`** or **`/session-offload`**.
- **Always leave a paper trail.** If moving between sessions or agents, use **`/handoff`**.

---
*Last Updated: 2026-09-24*

## Current project status — 2026-09-24

- **Phase 1 MVP core:** ✅ Implemented and deployed-ready — incident CRUD, shifts, handoff, auth, officer/broadcast modes, kiosk launch, Docker/PostGIS.
- **Phase 2 analytics/reporting:** ✅ Implemented — heatmaps, trends, CSV export, Shift Report v1/v2, server-side PDF export.
- **Phase 2 floorplans:** ✅ Implemented for the registered BJH North sheets — registry/search API, immutable versions, rotated image overlays, normalized incident-local pins, reasoned history, report metadata.
- **Phase 2 duress CSV:** ⚠️ Blocked — requires a representative MTF export CSV.
- **Other-campus floorplans:** ⚠️ Blocked — requires source PDFs and surveyed footprint coordinates.
- **Phase 3 integrations:** ❌ Not started — duress API, CAD/radio, mobile field UI, audit-log expansion.

## Current verification evidence

- Backend: 100 tests passing on the existing migrated development database.
- Frontend: 33 tests passing; production build passing.
- Python compile checks and `git diff --check`: passing.
- Development database: 32 floorplan versions; no floorplans missing a current version.
- Fresh isolated-database verification remains open because a prior temporary container exited with code 137.

## Next-step options

1. **Close floorplan delivery:** run live browser QA for create/edit/reposition/reassign/history, then commit and push the feature.
2. **Operational hardening:** install production backup timers and complete a restore drill.
3. **Data integration:** obtain the MTF CSV sample and implement the duress import.
4. **Architecture cleanup:** split `OfficerMap` and add bundle code-splitting before mobile work.
5. **Field workflow:** write a Phase 3 mobile/officer UX spec before implementation.


### Floorplan Registry & Incident-Local Pins (2026-09-24)
- **Status:** Implemented in the current uncommitted feature; pending live browser QA and commit/push.
- **What:** Searchable registry-backed floorplans, immutable version snapshots, rotated image overlays, normalized local incident pins, edit/reassign/clear workflow with reasoned history, and report metadata.
- **Key paths:** `database/migrations/002_floorplans.sql`, `database/migrations/003_incident_floorplan_pins.sql`, `backend/routes/floorplans.py`, `backend/routes/incidents.py`, `frontend/src/components/OfficerMap.tsx`, `frontend/src/components/IncidentForm.tsx`.
- **Verification:** Backend 100 tests, frontend 33 tests, frontend production build, Python compile, and diff checks pass on the existing development DB. Fresh isolated DB verification remains open.

### Floorplan Selection & Overlay (2026-09-16) — historical precursor
- **Status:** Complete ✅
- **What:** Hierarchical building → floor selection with `L.imageOverlay` and `fitBounds` animation on the officer map
- **Architecture:**
  - `frontend/src/data/floorplans.json` — Legacy prototype reference only; runtime floorplans are API-backed
  - `frontend/src/components/FloorplanSelector.tsx` — React dropdown component (TDD, 5 test cases)
  - `frontend/src/components/OfficerMap.tsx` — `useEffect` for `L.imageOverlay` lifecycle + `map.flyToBounds()`
  - `frontend/public/floorplans/` — directory for floorplan images
- **Verification:**
  - 16/16 tests passing (4 test files)
  - TypeScript `tsc --noEmit`: clean (no errors)
  - Production build: ✓ built in 2.38s (810 KB JS, 41 KB CSS)
- **Data chain:** `FloorplanSelector` → `OfficerMap` (floorId, floorName) → `OfficerPage` (`handleBuildingSelect`/`handleFloorSelect`) → `IncidentForm` (`preSelectedBuilding`/`preSelectedFloor`)
- **No backend changes required** — historical prototype constraint; superseded by the registry-backed implementation above
