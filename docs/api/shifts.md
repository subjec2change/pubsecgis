# Shifts Router

> Route: `routes/shifts.py` — Mounted at `/api/shifts`

## Endpoints

### `GET /api/shifts`

List shifts, optionally filtered by date.

**Auth:** None required

**Query parameters:**

| Parameter | Type | Alias | Default | Description |
|-----------|------|-------|---------|-------------|
| `date` | string | `date` | — | Filter by date (`YYYY-MM-DD`) |

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

**Order:** `shift_date DESC, id ASC`

---

### `POST /api/shifts`

Get or create a shift by code and date. Idempotent — if the shift already exists, returns it. Requires authentication.

**Auth:** Required — `Authorization: Bearer <token>`

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `shift_code` | Yes | Shift code: `DAY`, `EVE`, or `NIGHT` |
| `shift_date` | Yes | Date in `YYYY-MM-DD` format |

**Response:** `ShiftResponse` — 200 if existing, 201 if newly created

**Shift time windows:**

| Code | Start | End |
|------|-------|-----|
| `DAY` | 06:30 | 15:00 |
| `EVE` | 14:30 | 23:00 |
| `NIGHT` | 22:30 | 07:00 (next day) |

**200 OK / 201 Created** — `ShiftResponse`

**400 Bad Request** — Invalid shift code.

```json
{"detail": "Invalid shift code: XYZ"}
```

---

## Schemas

### `ShiftResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Primary key |
| `shift_date` | date | Shift date |
| `shift_code` | string | Shift code (`DAY`, `EVE`, `NIGHT`) |
| `start_time` | string | ISO 8601 time string |
| `end_time` | string | ISO 8601 time string |
| `created_at` | datetime | ISO 8601 creation timestamp |
