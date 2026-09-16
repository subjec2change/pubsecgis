# Users Router

> Route: `routes/users.py` — Mounted at `/api/users`

## Endpoints

### `GET /api/users`

List all active users. No authentication required.

**Auth:** None required

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

Returns only active users (filters out `active = false`).

---

## Schemas

### `UserResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Primary key |
| `username` | string | Login username |
| `display_name` | string | Human-readable name |
| `role` | string | User role (`admin`, `lead`, `officer`) |
| `active` | boolean | Whether the account is active |
| `created_at` | datetime | ISO 8601 creation timestamp |
