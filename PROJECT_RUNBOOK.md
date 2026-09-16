# PUSECGIS Project Runbook

This document serves as the authoritative guide for developers and AI agents working on the PUSECGIS project. It defines the specialized skills, the agency roster, and the mandatory operational flows.

## 🛠 Specialized Skillset

### Core Project Skills
- **`pusecgis-workflow`**: Optimized patterns for Dashboard, Kiosk, and Broadcast UI development.
- **`session-offload`**: **CRITICAL.** Use when context reaches ~95% capacity. Saves all loaded skills, agency rosters, and project state to Hermes Memory, MemPalace, Obsidian, and the Session Diary to ensure zero loss during handoffs.

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
*Last Updated: 2026-09-16*

## Feature Completion Log

### Floorplan Selection & Overlay (2026-09-16)
- **Status:** Complete ✅
- **What:** Hierarchical building → floor selection with `L.imageOverlay` and `fitBounds` animation on the officer map
- **Architecture:**
  - `frontend/src/data/floorplans.json` — JSON definition of buildings/floors with image paths and map bounds
  - `frontend/src/components/FloorplanSelector.tsx` — React dropdown component (TDD, 5 test cases)
  - `frontend/src/components/OfficerMap.tsx` — `useEffect` for `L.imageOverlay` lifecycle + `map.flyToBounds()`
  - `frontend/public/floorplans/` — directory for floorplan images
- **Verification:**
  - 16/16 tests passing (4 test files)
  - TypeScript `tsc --noEmit`: clean (no errors)
  - Production build: ✓ built in 2.38s (810 KB JS, 41 KB CSS)
- **Data chain:** `FloorplanSelector` → `OfficerMap` (floorId, floorName) → `OfficerPage` (`handleBuildingSelect`/`handleFloorSelect`) → `IncidentForm` (`preSelectedBuilding`/`preSelectedFloor`)
- **No backend changes required** — fully frontend feature
