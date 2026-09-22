# PUSECGIS — Public Safety Common Operating Picture

Barnes-Jewish Hospital public-safety dashboard: officers log incidents on a live
map; supervisors review shift activity; broadcast screens run in kiosks.

## Language

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
A scheduled work period identified by date + code (DAY 06:30–15:00,
EVE 14:30–23:00 — windows deliberately overlap for handover). Incidents and
handoff notes attach to a Shift via FK; the FK, not clock time, is canonical
for shift membership.
_Avoid_: watch, tour

**Handoff Note**:
A free-text note a departing shift leaves for the next one, attached to a Shift
and its author.
_Avoid_: remark, comment
