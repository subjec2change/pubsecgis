# Health Endpoint

> Inline in `main.py` — Mounted at `/api/health`

## Endpoint

### `GET /api/health`

Health check endpoint. No authentication required.

**Auth:** None required

**200 OK** — `application/json`:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "db": "connected"
}
```

Returns `"status": "healthy"` and `"db": "connected"` when the database is reachable. Used by load balancers, Docker healthchecks, and monitoring systems.
