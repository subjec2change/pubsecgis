# Handoff Notes Router

> Route: `routes/handoff.py` — Mounted at `/api/handoff`

## Endpoints

### `GET /api/handoff/notes`

List shift handoff notes with optional filters.

**Auth:** None required

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

Ordered by `created_at DESC` (most recent first).

---

### `POST /api/handoff/notes`

Create a handoff note. Requires authentication.

**Auth:** Required — `Authorization: Bearer <token>`

**Request body:**

```json
{
  "shift_id": 1,
  "location_ref": "Adult ED",
  "note": "Camera blind spot near parking garage B exit"
}
```

**Request model:** `HandoffNoteCreate` (see [schemas](#schemas))

**201 Created** — `HandoffNoteResponse` (same as GET response, includes `logged_by_user`)

---

## Schemas

### `HandoffNoteCreate`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `shift_id` | integer | Yes | — | Shift to associate with |
| `location_ref` | string \| null | No | `null` | Optional location (null = building-wide) |
| `note` | string | Yes | — | Handoff note text |

### `HandoffNoteResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Primary key |
| `shift_id` | integer | FK to shifts |
| `location_ref` | string \| null | Location reference (null = building-wide) |
| `note` | string | Handoff note text |
| `logged_by` | integer | User ID of the note author |
| `logged_by_user` | UserResponse \| null | Resolved user object |
| `created_at` | datetime | ISO 8601 creation timestamp |
