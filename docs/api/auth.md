# Auth Router

> Route: `routes/auth.py` — Mounted at `/api/auth`

## Endpoints

### `POST /api/auth/login`

Authenticate a user and receive a JWT bearer token.

**Auth:** None required

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
  "access_token": "eyJhbG...NiIs...",
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

```json
{"detail": "username and password are required"}
```

**401 Unauthorized** — Invalid credentials (wrong password or non-existent user).

```json
{"detail": "Invalid credentials"}
```

### `GET /api/auth/me`

Return the currently authenticated user profile.

**Auth:** Required — `Authorization: Bearer <token>`

**Response model:** `UserResponse`

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

### `UserCreate`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | Yes | Login username |
| `display_name` | string | Yes | Human-readable name |
| `role` | string | Yes | User role |
| `password` | string | Yes | Plain-text password (hashed server-side with bcrypt) |

### `UserBase`

| Field | Type | Description |
|-------|------|-------------|
| `username` | string | Login username |
| `display_name` | string | Human-readable name |
| `role` | string | User role |

### `UserResponse.model_config`

```python
{"from_attributes": True}  # Pydantic v2: read from ORM objects
```
