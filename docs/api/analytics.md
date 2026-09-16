# Analytics (Heatmap, Trends, Export)

> Route: `routes/analytics.py` — Mounted at `/api/incidents` (same router prefix)

These endpoints provide analytics, visualization, and export capabilities for incidents. All are attached to the `/api/incidents` path prefix.

## Endpoints

### `GET /api/incidents/heatmap`

Return heatmap data within a geographic radius of a center point.

**Auth:** None required

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `lat` | float | Yes | — | Latitude of search center (-90 to 90) |
| `lng` | float | Yes | — | Longitude of search center (-180 to 180) |
| `radius` | integer | No | 500 | Search radius in meters (1–5000) |
| `limit` | integer | No | 200 | Max aggregation points to return (1–5000) |

**200 OK** — `array[{lat, lng, intensity}]`:

```json
[
  { "lat": 38.647200, "lng": -90.257750, "intensity": 9.0 },
  { "lat": 38.647180, "lng": -90.257800, "intensity": 6.0 },
  { "lat": 38.648100, "lng": -90.256400, "intensity": 3.0 }
]
```

**Intensity weighting:**

| Status | Weight |
|--------|--------|
| `open` | 3 |
| `escalating` | 2 |
| `monitoring` | 1 |
| `resolved` | 0 |
| `archived` | 0 (excluded) |

Points with intensity 0 are excluded. Results are sorted by descending intensity and capped at `limit`. Uses `ST_DWithin` against PostGIS geography column.

---

### `GET /api/incidents/trends`

Return time-series incident counts grouped by week or month.

**Auth:** None required

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

Excludes `archived` incidents.

---

### `GET /api/incidents/export.csv`

Export incidents as a CSV file download.

**Auth:** None required

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | string | No | — | Filter by status (one of: `open`, `escalating`, `monitoring`, `resolved`, `archived`) |
| `start_date` | string | No | — | Start date filter (`YYYY-MM-DD`) |
| `end_date` | string | No | — | End date filter (`YYYY-MM-DD`) |

**200 OK** — `text/csv` with `Content-Disposition: attachment; filename="incidents.csv"`

```csv
id,incident_type,location_ref,description,status,response_phase,created_at,logged_by
1,victim_of_violence,"Adult ED — Room 4","Patient exhibiting violent behavior",open,on_scene,2026-09-16T10:30:00Z,1
```

**CSV columns:** `id`, `incident_type`, `location_ref`, `description`, `status`, `response_phase`, `created_at`, `logged_by`

Fields containing commas, quotes, or newlines are properly quoted. Rows ordered by `created_at DESC`.

**400 Bad Request** — Invalid status value.

```json
{"detail": "Invalid status: invalid. Must be one of ['archived', 'escalating', 'monitoring', 'open', 'resolved']"}
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
