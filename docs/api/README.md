# API Reference

Structured endpoint documentation extracted from the FastAPI backend.

---

## Base URL

```
http://localhost:8000/api        # Development (Vite dev server proxies to :8000)
https://<server>/api             # Production (via Nginx reverse proxy)
```

All responses are JSON unless otherwise noted. Errors use the FastAPI default `{"detail": "..."}` format.

---

## Authentication

### `POST /api/auth/login`

Authenticate a user and receive a JWT bearer token.

**Request body:**

```json
{
  "username": "admin.bjs",
  "password": "pusecgis_dev"
}
```

**200 OK** — `application/json`:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "username": "admin.bjs",
    "display_name": "Admin",
    "role": "admin"
  }
}
```

**400 Bad Request** — `username` or `password` missing.

**401 Unauthorized** — Invalid credentials.

---

### `GET /api/auth/me`

Return the currently authenticated user profile.

**Header required:** `Authorization: Bearer <token>`

**200 OK** — `application/json`:

```json
{
  "id": 1,
  "username": "admin.bjs",
  "display_name": "Admin",
  "role": "admin",
  "active": true,
  "created_at": "2026-09-01T00:00:00Z"
}
```

**401 Unauthorized** — Missing or invalid token.

**401 Unauthorized** — User not found or inactive.

---

## Incidents

### `GET /api/incidents`

List incidents with optional filters. Archived incidents excluded by default.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | — | Filter by status (`open`, `resolved`, `monitoring`, `escalating`, `archived`) |
| `type` | string | — | Filter by incident type (e.g. `victim_of_violence`) |
| `date` | string | — | Filter by created date (`YYYY-MM-DD`) |
| `location` | string | — | Case-insensitive substring match on `location_ref` |
| `shift` | integer | — | Filter by shift ID |
| `include_archived` | boolean | `false` | Include archived incidents in results |

**200 OK** — `array[IncidentResponse]`:

```json
[
  {
    "id": 1,
    "shift_id": 1,
    "incident_type": "victim_of_violence",
    "location_ref": "Adult ED — Room 4",
    "description": "Patient exhibiting violent behavior",
    "status": "open",
    "response_phase": "on_scene",
    "logged_by": 1,
    "logged_by_user": {
      "id": 1,
      "username": "admin.bjs",
      "display_name": "Admin",
      "role": "admin",
      "active": true,
      "created_at": "2026-09-01T00:00:00Z"
    },
    "created_at": "2026-09-16T10:30:00Z",
    "updated_at": "2026-09-16T10:35:00Z",
    "archived_at": null,
    "latitude": 38.64718,
    "longitude": -90.25780,
    "floorplan_version_id": 42,
    "floorplan_x": 0.42,
    "floorplan_y": 0.68,
    "room_label": "ICU 3A"
  }
]
```

**Response model (`IncidentResponse`):**

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
| `created_at` | datetime | ISO 8601 timestamp |
| `updated_at` | datetime | ISO 8601 timestamp |
| `archived_at` | datetime \| null | When archived (null if active) |
| `latitude` | float \| null | Geographic latitude |
| `longitude` | float \| null | Geographic longitude |

---

### `POST /api/incidents`

Create a new incident. Requires authentication.

**Header required:** `Authorization: Bearer <token>`

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
  "longitude": -90.25775
}
```

**Request model (`IncidentCreate`):**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `shift_id` | integer | Yes | — | Shift to associate with |
| `incident_type` | string | Yes | — | One of: `victim_of_violence`, `problematic_patient`, `agitated_visitor`, `patient_with_sitter`, `elopment_patient`, `hardware_facility_issue`, `general_safety_concern`, `duress_alarm_call` |
| `location_ref` | string | Yes | — | Location description |
| `description` | string \| null | No | `null` | Incident details |
| `status` | string | No | `"open"` | Incident status |
| `response_phase` | string \| null | No | `null` | Current response phase |
| `latitude` | float \| null | No | `null` | Geographic latitude (-90 to 90) |
| `longitude` | float \| null | No | `null` | Geographic longitude (-180 to 180) |

**201 Created** — `IncidentResponse` (same as above).

**422 Unprocessable Entity** — Validation error (invalid type, lat/lng out of range).

---

### `PUT /api/incidents/{incident_id}`

Update an incident. Requires `lead` or `admin` role.

**Header required:** `Authorization: Bearer <token>`

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

**Request model (`IncidentUpdate`):** All fields optional, same validation as create.

**200 OK** — `IncidentResponse` (full updated object).

**401/403** — Unauthorized / insufficient role.

**404 Not Found** — Incident does not exist.

---

### `DELETE /api/incidents/{incident_id}`

Delete an incident. Requires `admin` role.

**Header required:** `Authorization: Bearer <token>`

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `incident_id` | integer | Incident to delete |

**204 No Content** — Deleted successfully.

**401/403** — Unauthorized / insufficient role.

**404 Not Found** — Incident does not exist.

---

### `GET /api/incidents/response-phases`

Return the full list of available response phases with display labels. No auth required.

**200 OK** — `application/json`:

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

## Floorplans and incident-local pins

### `GET /api/floorplans`

Search active registry-backed floorplan sheets. Optional `q`, `building_id`, and `include_inactive` filters are supported. Each response includes the current immutable version metadata.

### `POST /api/floorplans` / `DELETE /api/floorplans/{floor_id}`

Admin-only registry management. Creating a sheet creates immutable version 1; deleting removes the registry row without deleting the served image.

### `GET /api/incidents/{incident_id}/floorplan-history`

Lead/admin-only history of prior local pin states, including exact floorplan version, normalized coordinates, room label, actor, reason, and timestamp.

Incident create/update payloads support `floorplan_version_id`, normalized `floorplan_x`/`floorplan_y` in [0,1], optional `room_label`, and `pin_reason`. Pin changes preserve the previous state and require a non-empty reason.

---

## Shift reports

### `GET /api/reports/shift`

Lead/admin-only report for a selected `date` + `code`, or the most recently ended shift when neither is supplied. Use `format=pdf` for a PDF download. Reports include totals, per-type and per-officer breakdowns, timeline data, handoff notes, and floorplan pin detail.

---

## Analytics

### `GET /api/incidents/heatmap`

Return heatmap data within a radius of a center point.

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `lat` | float | Yes | — | Latitude of search center (-90 to 90) |
| `lng` | float | Yes | — | Longitude of search center (-180 to 180) |
| `radius` | integer | No | 500 | Search radius in meters (1–5000) |
| `limit` | integer | No | 200 | Max points to return (1–5000) |

**200 OK** — `array[{lat, lng, intensity}]`:

```json
[
  { "lat": 38.647200, "lng": -90.257750, "intensity": 9.0 },
  { "lat": 38.647180, "lng": -90.257800, "intensity": 6.0 },
  { "lat": 38.648100, "lng": -90.256400, "intensity": 3.0 }
]
```

**Intensity weighting:** `open` = 3, `escalating` = 2, `monitoring` = 1, `resolved` = 0. Points with intensity 0 are filtered out. Results are sorted by descending intensity.

---

### `GET /api/incidents/trends`

Return time-series incident counts grouped by week or month.

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `period` | string | No | `"weekly"` | Grouping: `weekly` or `monthly` |
| `start_date` | string | No | — | Start date filter (`YYYY-MM-DD`) |
| `end_date` | string | No | — | End date filter (`YYYY-MM-DD`) |

**200 OK** — `array[Bucket]`:

```json
[
  {
    "date_str": "2026-W37",
    "count": 23,
    "by_type": {
      "victim_of_violence": 5,
      "problematic_patient": 8,
      "agitated_visitor": 4,
      "patient_with_sitter": 3,
      "elopment_patient": 1,
      "general_safety_concern": 2
    }
  },
  {
    "date_str": "2026-W38",
    "count": 19,
    "by_type": { ... }
  }
]
```

**Bucket model:**

| Field | Type | Description |
|-------|------|-------------|
| `date_str` | string | `YYYY-Www` for weekly, `YYYY-MM` for monthly |
| `count` | integer | Total incidents in bucket |
| `by_type` | object | `incident_type` → count map |

---

### `GET /api/incidents/export.csv`

Export incidents as a CSV download.

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | string | No | — | Filter by status (one of: `open`, `escalating`, `monitoring`, `resolved`, `archived`) |
| `start_date` | string | No | — | Start date filter (`YYYY-MM-DD`) |
| `end_date` | string | No | — | End date filter (`YYYY-MM-DD`) |

**200 OK** — `text/csv`:

```
id,incident_type,location_ref,description,status,response_phase,created_at,logged_by
1,victim_of_violence,"Adult ED — Room 4","Patient exhibiting violent behavior",open,on_scene,2026-09-16T10:30:00Z,1
```

**CSV columns:** `id`, `incident_type`, `location_ref`, `description`, `status`, `response_phase`, `created_at`, `logged_by`. Fields containing commas, quotes, or newlines are properly quoted.

**Content-Disposition:** `attachment; filename="incidents.csv"`

---

## Broadcast (Public / No Auth)

### `GET /api/broadcast/incidents`

All open, escalating, and monitoring incidents — suitable for kiosk/broadcast screens. No authentication required.

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

Filtered to `status IN (open, escalating, monitoring)`. Ordered by `created_at DESC`.

---

### `GET /api/broadcast/config`

Return incident type configuration with colors and labels. No authentication required.

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

8 incident types. Used by broadcast screens to render color-coded markers.

---

## Handoff Notes

### `GET /api/handoff/notes`

List shift handoff notes with optional filters.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `shift` | integer | — | Filter by shift ID |
| `date` | string | — | Filter by date string |

**200 OK** — `array[HandoffNoteResponse]`:

```json
[
  {
    "id": 1,
    "shift_id": 1,
    "location_ref": "Adult ED",
    "note": "Monitor for follow-ups from last shift",
    "logged_by": 1,
    "created_at": "2026-09-16T10:00:00Z"
  }
]
```

---

### `POST /api/handoff/notes`

Create a handoff note. Requires authentication.

**Header required:** `Authorization: Bearer <token>`

**Request body:**

```json
{
  "shift_id": 1,
  "location_ref": "Adult ED",
  "note": "Camera blind spot near parking garage B exit"
}
```

**Request model (`HandoffNoteCreate`):**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `shift_id` | integer | Yes | — | Shift to associate with |
| `location_ref` | string \| null | No | `null` | Optional location (null = building-wide) |
| `note` | string | Yes | — | Handoff note text |

**201 Created** — `HandoffNoteResponse` (same as above, includes `logged_by_user`).

---

## Locations

### `GET /api/locations`

Search locations with autocomplete, or list all locations.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | — | Search query — returns locations matching `name`, `building`, `floor`, or `room_or_area` (case-insensitive, limit 50). If omitted, returns all locations. |

**200 OK** — `array[LocationResponse]`:

```json
[
  {
    "id": 1,
    "name": "Adult ED Desk",
    "building": "Barnes-Jewish Hospital",
    "floor": "1",
    "room_or_area": "Emergency Department",
    "latitude": 38.647180,
    "longitude": -90.257800
  }
]
```

---

## Users

### `GET /api/users`

List all active users. No authentication required.

**200 OK** — `array[UserResponse]`:

```json
[
  {
    "id": 1,
    "username": "admin.bjs",
    "display_name": "Admin",
    "role": "admin",
    "active": true,
    "created_at": "2026-09-01T00:00:00Z"
  }
]
```

---

## Shifts

### `GET /api/shifts`

List shifts, optionally filtered by date.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `date` | string | — | Filter by date (`YYYY-MM-DD`) |

**200 OK** — `array[ShiftResponse]`:

```json
[
  {
    "id": 1,
    "shift_date": "2026-09-16",
    "shift_code": "DAY",
    "start_time": "06:30:00",
    "end_time": "15:00:00",
    "created_at": "2026-09-16T06:00:00Z"
  }
]
```

**Shift codes:** `DAY` (06:30–15:00), `EVE` (14:30–23:00), `NIGHT` (22:30–07:00 next day).

---

### `POST /api/shifts`

Get or create a shift by code and date. Idempotent. Requires authentication.

**Header required:** `Authorization: Bearer <token>`

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `shift_code` | Yes | `DAY`, `EVE`, or `NIGHT` |
| `shift_date` | Yes | Date in `YYYY-MM-DD` format |

**200/201** — `ShiftResponse`. Returns existing shift if one already exists for the code+date, creates one if not.

**400 Bad Request** — Invalid shift code.

---

## Health

### `GET /api/health`

Health check endpoint. No authentication required.

**200 OK** — `application/json`:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "db": "connected"
}
```

---

## Error Responses

All error responses follow the FastAPI/Pydantic convention:

**400 Bad Request:**
```json
{"detail": "username and password are required"}
```

**401 Unauthorized:**
```json
{"detail": "Invalid token"}
```

**403 Forbidden:**
```json
{"detail": "Requires role: lead, admin"}
```

**404 Not Found:**
```json
{"detail": "Incident not found"}
```

**422 Unprocessable Entity:**
```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["body", "incident_type"],
      "msg": "Value error, must be one of: [...]",
      "input": "invalid_type"
    }
  ]
}
```

---

## Data Types Reference

### Incident Types

| Code | Label | Color |
|------|-------|-------|
| `victim_of_violence` | Victim of Violence | `#DC2626` (Red) |
| `problematic_patient` | Problematic Patient | `#D97706` (Amber) |
| `agitated_visitor` | Agitated Visitor | `#EA580C` (Orange) |
| `patient_with_sitter` | Patient with Sitter | `#2563EB` (Blue) |
| `elopment_patient` | Elopment Patient | `#16A34A` (Green) |
| `hardware_facility_issue` | Hardware / Facility Issue | `#4B5563` (Gray) |
| `general_safety_concern` | General Safety Concern | `#7E22CE` (Purple) |
| `duress_alarm_call` | Duress Alarm Call | `#1F2937` (Dark Gray) |

### Incident Statuses

| Status | Description |
|--------|-------------|
| `open` | Active, needs attention |
| `escalating` | Situation is deteriorating |
| `monitoring` | Being watched but no immediate action needed |
| `resolved` | Issue resolved, awaiting auto-archive after 24h |
| `archived` | Resolved incident older than 24h (auto-archived) |

### Response Phases

| Phase | Label |
|-------|-------|
| `en_route` | Officer en route |
| `situational_awareness` | Situational awareness |
| `on_scene` | Officer on scene |
| `dps_intervention` | DPS intervention concluded |
| `supervisor_on_scene` | Supervisor on scene |
| `medical_needed` | Medical response needed |
| `situation_stabilized` | Situation stabilized |
| `pending_followup` | Pending follow-up |
| `report_completed` | Incident report completed |

---

## Rate Limits & Performance

No explicit rate limiting is configured. The backend uses async SQLAlchemy with connection pooling.

- **Broadcast endpoint**: Poll every 30 seconds (recommended by frontend).
- **Heatmap**: Default 500m radius, 200 point limit.
- **Auto-archive**: Runs every 30 minutes in background, archiving resolved incidents older than 24 hours.

## Authentication Flow

1. Client calls `POST /api/auth/login` with `{username, password}`.
2. Server returns `{access_token, token_type, user}`.
3. Client stores `access_token` in `localStorage`.
4. Every authenticated request includes `Authorization: Bearer <token>`.
5. Token expires after `PUBSECGIS_ACCESS_TOKEN_EXPIRE_MINUTES` (default 480 minutes / 8 hours).
6. On 401, frontend clears token and redirects to `/login`.

## CORS

CORS is configured to allow all origins (`"*"`), credentials, and headers. In production, restrict `allow_origins` to the actual frontend domain.
