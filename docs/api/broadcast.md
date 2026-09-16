# Broadcast Router

> Route: `routes/broadcast.py` — Mounted at `/api/broadcast`

Public endpoints for broadcast/kiosk screens. No authentication required.

## Endpoints

### `GET /api/broadcast/incidents`

All open, escalating, and monitoring incidents — suitable for kiosk/broadcast screens.

**Auth:** None required

**200 OK** — `array[BroadcastIncidentResponse]`:

```json
[
  {
    "id": 1,
    "incident_type": "victim_of_violence",
    "location_ref": "Adult ED — Room 4",
    "description": "Verbal altercation between visitor and staff",
    "status": "open",
    "response_phase": "on_scene",
    "created_at": "2026-09-16T10:30:00Z",
    "type_info": {
      "type": "victim_of_violence",
      "color": "#DC2626",
      "label": "Victim of Violence"
    },
    "archived_at": null
  }
]
```

**Filter:** `status IN ('open', 'escalating', 'monitoring')`

**Order:** `created_at DESC` (most recent first)

**Recommended poll interval:** every 30 seconds (as per frontend BroadcastPage)

---

### `GET /api/broadcast/config`

Return incident type configuration with colors and labels.

**Auth:** None required

**200 OK** — `array[IncidentTypeConfig]`:

```json
[
  { "type": "victim_of_violence", "color": "#DC2626", "label": "Victim of Violence" },
  { "type": "problematic_patient", "color": "#D97706", "label": "Problematic Patient" },
  { "type": "agitated_visitor", "color": "#EA580C", "label": "Agitated Visitor" },
  { "type": "patient_with_sitter", "color": "#2563EB", "label": "Patient with Sitter" },
  { "type": "elopment_patient", "color": "#16A34A", "label": "Elopment Patient" },
  { "type": "hardware_facility_issue", "color": "#4B5563", "label": "Hardware / Facility Issue" },
  { "type": "general_safety_concern", "color": "#7E22CE", "label": "General Safety Concern" },
  { "type": "duress_alarm_call", "color": "#1F2937", "label": "Duress Alarm Call" }
]
```

**8 incident types.** Used by broadcast screens to render color-coded markers.

---

## Schemas

### `BroadcastIncidentResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Incident ID |
| `incident_type` | string | Type key |
| `location_ref` | string | Human-readable location |
| `description` | string \| null | Incident details |
| `status` | string | `open` / `escalating` / `monitoring` |
| `response_phase` | string \| null | Current response phase |
| `created_at` | datetime | ISO 8601 creation timestamp |
| `type_info` | IncidentTypeConfig | Color + label for the incident type |
| `archived_at` | datetime \| null | When archived (null if active) |

### `IncidentTypeConfig`

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Incident type key |
| `color` | string | Hex color code |
| `label` | string | Human-readable label |
