# Locations Router

> Route: `routes/locations.py` — Mounted at `/api/locations`

## Endpoints

### `GET /api/locations`

Search locations with autocomplete, or list all locations if no query is provided.

**Auth:** None required

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

When `q` is provided, the search is case-insensitive across name, building, floor, and room_or_area fields. When `q` is omitted, all locations are returned.

---

## Schemas

### `LocationResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Primary key |
| `name` | string | Location name |
| `building` | string \| null | Building name |
| `floor` | string \| null | Floor identifier |
| `room_or_area` | string \| null | Room or area name |
| `latitude` | float \| null | Geographic latitude |
| `longitude` | float \| null | Geographic longitude |
