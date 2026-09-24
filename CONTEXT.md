# PUSECGIS — Public Safety Common Operating Picture

Barnes-Jewish Hospital public-safety dashboard: officers log incidents on a live
map; supervisors review shift activity; broadcast screens run in kiosks.

## Current status and decisions — 2026-09-24

- The original concept has narrowed from a general public-safety GIS platform to the internal BJH Public Safety COP described above.
- The operational MVP is implemented; current work is closing the versioned floorplan incident-pin feature and keeping deployment/documentation aligned.
- Floorplan-local coordinates are normalized to [0,1] with top-left origin and are independent of geographic markers.
- Immutable floorplan versions are required so historical incident pins never silently move when a sheet is replaced.
- User-editable pin changes preserve history and require a reason; resolved-incident corrections are lead/admin-only and do not reopen the incident.
- Remaining external-input blockers are a representative MTF duress CSV and source/survey data for other-campus floorplans.

## Decision options

1. Finish and push the current floorplan pin feature after live browser QA.
2. Prioritize production backup installation and restore-drill evidence.
3. Pause implementation for the duress CSV input and then build the importer.
4. Start a separately scoped Phase 3 mobile/field workflow design.


**Shift Report**:
An internal leadership document covering exactly one shift (date + code): the
incidents interacted with during it, per-type stats, an by-hour timeline, and the
shift's handoff notes. Generated on demand; not a filing form.
_Avoid_: export (that is the raw CSV), summary

**Export**:
A raw filtered CSV of incidents (status/date-range), pulled by leadership for
offline analysis. No narrative or stats.
_Avoid_: report, dump

**Shift**:
A scheduled work period identified by date + code (DAY 06:30–15:00, EVE 14:30–23:00, NIGHT 22:30–07:00 — windows deliberately overlap for handover). Incidents and handoff notes attach to a Shift via FK; the FK, not clock time, is canonical for shift membership.
_Avoid_: watch, tour

**Handoff Note**:
A free-text note a departing shift leaves for the next one, attached to a Shift
and its author.
_Avoid_: remark, comment
