# PUSECGIS — Session Transcript

> **Date:** 2026-09-02
> **Session Type:** Brainstorming (shrimp-brainstorming skill)
> **Project:** PUSECGIS — Public Safety Common Operating Picture for BJC Healthcare

---

## Session Summary

User presented a vague idea for an "OpenSource GIS platform for mapping public safety risks, emergency resources, and incident response across communities." Through iterative research, clarification, and refinement, we distilled it into a concrete MVP spec for BJC Healthcare's internal public safety operations.

## Key Decisions

1. **Domain:** Healthcare facility public safety — specifically BJC (Barnes-Jewish Hospital and WashU Medicine campus), not general community emergency management
2. **End Users:** BJC Public Safety officers, floor rounding officers, Dispatch (~5-20 per shift, 3 shifts/day)
3. **Core Problem:** Shift-to-shift information loss — knowledge evaporates over radio, no persistent visual record
4. **Display Architecture:** Two UI modes — Officer UI (data entry, authenticated) + Broadcast UI (read-only, auto-refresh, kiosk mode for 6 screens)
5. **Broadcast Screens:** Main Control (1) + 3 Satellite Offices (3) + Childrens' ED (1) + Adult ED (1) = 6 total screens
6. **Data Sources:** Manual entry (officers/dispatch) → Phase 1; Duress alarm CSV import → Phase 2
7. **Tech Stack:** Python/FastAPI backend, PostgreSQL/PostGIS, React/Leaflet frontend, Nginx proxy, internal network only
8. **CIP/COP:** Common Intelligence Picture / Common Operating Picture — not "Care Improvement Plan"

## User Corrections

- User corrected "soom sitters" → "room sitters" and "elopment" → "elopment" (healthcare terminology)
- Clarified CIP = Common Intelligence Picture (not Care Improvement Plan)
- Clarified screen locations: satellite offices are separate rooms, ED desks at Childrens' and Adult ED

## Files Created

- `/home/thx1138/PUBSECGIS/IDEA.md` — Original concept (user-provided)
- `/home/thx1138/PUBSECGIS/concept-brief.md` — Current concept brief
- `/home/thx1138/PUBSECGIS/research-ledger.md` — Research findings
- `/home/thx1138/PUBSECGIS/mvp-spec.md` — Full MVP spec (draft 0.1)
- `/home/thx1138/PUBSECGIS/pdf-spec.json` — PDF generation spec (for PDF creation)
- `/home/thx1138/PUBSECGIS/pusecgis-mvp.pdf` — Generated PDF (pending creation)

## Next Steps (When Resuming)

1. Review MVP spec draft 0.1 — adjust, add, remove features
2. Gather floor plan PDFs — Barnes-Jewish main campus
3. Get sample MTF CSV — one duress alarm export for format analysis
4. Confirm server specs — what BJC IT can provide
5. Draft UI wireframes — pixel-perfect for Officer UI and Broadcast UI
6. Start coding — set up dev environment (PostgreSQL, FastAPI, React)

## Research Findings

- No direct competitor at the intersection of SNF safety incidents + GIS
- Duress alarm systems exist (Cognosos, kontakt.io, Sonitor) but no cross-facility geographic analytics
- CMS regulates elopement prevention — regulatory urgency creates buyer demand
- Open-source GIS stack (QGIS, GeoServer, PostGIS, Leaflet) is mature and free
- BJC operates through Joint Public Safety Center (WashU Protective Services + WashU Emergency Management + BJC Public Safety)
