# Incidents Router

> Route: `routes/incidents.py` — Mounted at `/api/incidents`

## Endpoints

### `GET /api/incidents`

List incidents with optional filters. Archived incidents are excluded by default.

**Auth:** None required

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | — | Filter by status (`open`, `resolved`, `monitoring`, `escalating`, `archived`) |
| `type` | string | — | Filter by incident type (e.g. `victim_of_violence`) |
| `date` | string | — | Filter by created date (`YYYY-MM-DD`) |
| `location` | string | — | Case-insensitive substring match on `location_ref` |
| `shift` | integer | — | Filter by shift ID |
| `include_archived` | boolean | `false` | Include archived incidents in results |

**200 OK** — `array[IncidentResponse]`

See the [IncidentResponse schema](#schemas) for the full response shape.

---

### `POST /api/incidents`

Create a new incident. Requires authentication.

**Auth:** Required — `Authorization: Bearer <token>`

**Request body:**

```json
{
  "shift_id": 1,
  "incident_type": "victim_of_violence",
  "location_ref": "Adult ED — Nurse Station",
  "description": "Verbal altercation between visitor and staff",
  "status": "open",
  "response_phase": "en_route",
  "latitude": 38.64720,
  "longitude": -90.25775,
  "floorplan_version_id": 42,
  "floorplan_x": 0.42,
  "floorplan_y": 0.68,
  "room_label": "ICU 3A"
}
```

**Request model:** `IncidentCreate` (see [schemas](#schemas))

**201 Created** — `IncidentResponse` (full created object with `id`, timestamps, etc.)

**422 Unprocessable Entity** — Validation error (invalid incident type, lat/lng out of range)

---

### `PUT /api/incidents/{incident_id}`

Update an incident. Requires `lead` or `admin` role.

**Auth:** Required — `lead` or `admin` role

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `incident_id` | integer | Incident to update |

**Request body (partial update — any field may be omitted):**

```json
{
  "status": "resolved",
  "response_phase": "report_completed"
}
```

**Request model:** `IncidentUpdate` (all fields optional; same validation as `IncidentCreate`)

**200 OK** — `IncidentResponse` (full updated object)

**401/403** — Unauthorized or insufficient role

**404 Not Found** — Incident does not exist

---

### `DELETE /api/incidents/{incident_id}`

Archive an incident rather than physically deleting it, preserving its identity and floorplan pin history. Requires `admin` role and a non-empty `reason` query parameter.

**Auth:** Required — `admin` role

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `incident_id` | integer | Incident to delete |

**204 No Content** — Deleted successfully

**401/403** — Unauthorized or insufficient role

**404 Not Found** — Incident does not exist

---

### `GET /api/incidents/response-phases`

Return the full list of available response phases with display labels. No auth required.

**Auth:** None required

**200 OK** — `GetResponsePhasesResponse`:

```json
{
  "phases": [
    { "phase": "en_route", "label": "Officer en route" },
    { "phase": "situational_awareness", "label": "Situational awareness" },
    { "phase": "on_scene", "label": "Officer on scene" },
    { "phase": "dps_intervention", "label": "DPS intervention concluded" },
    { "phase": "supervisor_on_scene", "label": "Supervisor on scene" },
    { "phase": "medical_needed", "label": "Medical response needed" },
    { "phase": "situation_stabilized", "label": "Situation stabilized" },
    { "phase": "pending_followup", "label": "Pending follow-up" },
    { "phase": "report_completed", "label": "Incident report completed" }
  ]
}
```

**9 response phases total.**

---

## Schemas

### `IncidentCreate`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `shift_id` | integer | Yes | — | Shift to associate with |
| `incident_type` | string | Yes | — | One of the 8 defined types (see [incident types table](../../README.md#incident-types)) |
| `location_ref` | string | Yes | — | Human-readable location reference |
| `description` | string \| null | No | `null` | Incident details/description |
| `status` | string | No | `"open"` | Incident status |
| `response_phase` | string \| null | No | `null` | Current response phase |
| `latitude` | float \| null | No | `null` | Geographic latitude (-90 to 90) |
| `longitude` | float \| null | No | `null` | Geographic longitude (-180 to 180) |
| `floorplan_version_id` | integer \| null | No | `null` | Exact immutable floorplan version for a local pin |
| `floorplan_x` | float \| null | No | `null` | Normalized horizontal coordinate in [0,1], left-to-right |
| `floorplan_y` | float \| null | No | `null` | Normalized vertical coordinate in [0,1], top-to-bottom |
| `room_label` | string \| null | No | `null` | Optional room or area label, max 120 characters |
| `pin_reason` | string \| null | No | `null` | Required for later pin changes and resolved-incident corrections |

**Valid incident types:** `victim_of_violence`, `problematic_patient`, `agitated_visitor`, `patient_with_sitter`, `elopment_patient`, `hardware_facility_issue`, `general_safety_concern`, `duress_alarm_call`

### `IncidentUpdate`

Same fields as `IncidentCreate` but all are **optional** (partial update).

### `IncidentResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Primary key |
| `shift_id` | integer | FK to shifts |
| `incident_type` | string | One of the 8 defined types |
| `location_ref` | string | Human-readable location |
| `description` | string \| null | Incident details |
| `status` | string | `open` / `resolved` / `monitoring` / `escalating` / `archived` |
| `response_phase` | string \| null | Current response phase |
| `logged_by` | integer | User ID of the reporter |
| `logged_by_user` | UserResponse \| null | Resolved user object |
| `created_at` | datetime | ISO 8601 creation timestamp |
| `updated_at` | datetime | ISO 8601 last-update timestamp |
| `archived_at` | datetime \| null | When archived (null if active) |
| `latitude` | float \| null | Geographic latitude (extracted from PostGIS `geom`) |
| `longitude` | float \| null | Geographic longitude (extracted from PostGIS `geom`) |
| `floorplan_version_id` | integer \| null | Exact immutable floorplan version for the current local pin |
| `floorplan_x` / `floorplan_y` | float \| null | Normalized top-left-origin local coordinates |
| `room_label` | string \| null | Optional room or area label |
| `floorplan_version` | object \| null | Snapshot metadata for the exact rendered floorplan version |

### `GetResponsePhasesResponse`

| Field | Type | Description |
|-------|------|-------------|
| `phases` | array[ResponsePhaseConfig] | List of phase + label pairs |

### `ResponsePhaseConfig`

| Field | Type | Description |
|-------|------|-------------|
| `phase` | string | Phase key (e.g. `en_route`) |
| `label` | string | Human-readable label (e.g. `Officer en route`) |

### `IncidentTypeConfig`

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Incident type key |
| `color` | string | Hex color (e.g. `#DC2626`) |
| `label` | string | Human-readable label |
