# PUSECGIS Development Setup

> After completing this guide, you'll have a working local copy of PUSECGIS with a live database, backend API, and frontend dev server.

**Estimated time:** 15 minutes
**Prerequisites:** Python 3.11+, Node.js 18+, Docker

---

## 1. Prerequisites

Install these tools before you begin. If you already have them, verify the versions listed below.

| Tool | Minimum Version | Why You Need It |
|------|----------------|-----------------|
| Python | 3.11 | Runs the FastAPI backend |
| Node.js | 18 | Runs the Vite dev server and builds the frontend |
| Docker | 24+ | Runs PostgreSQL 16 + PostGIS in a container |

### Check your versions

```bash
python3 --version   # Should show 3.11 or higher
node --version      # Should show v18+ or higher
docker --version    # Should show 24.x or higher
```

If any of these are missing, install them before continuing.

---

## 2. Clone the Repository

```bash
git clone https://github.com/subjec2change/pubsecgis.git
cd pubsecgis
```

### Project Layout

```
pubsecgis/
├── backend/                     # FastAPI REST API (Python)
│   ├── main.py                  # App factory, routers, lifespan
│   ├── config.py                # Settings from env vars (PUBSECGIS_ prefix)
│   ├── dependencies.py          # Auth helpers, token utilities
│   ├── models/                  # SQLAlchemy ORM + Pydantic schemas
│   ├── crud/                    # Database operations (incidents, handoff, etc.)
│   ├── routes/                  # HTTP endpoint handlers
│   ├── tests/                   # Backend test suite
│   ├── requirements.txt         # Python dependencies
│   └── .venv/                   # Virtual environment (created next)
├── frontend/                    # React 18 + Vite 5 (TypeScript)
│   ├── src/                     # Source code (components, pages, API client)
│   ├── package.json             # Node dependencies
│   └── vite.config.ts           # Dev server + API proxy config
├── database/
│   ├── migrations/              # SQL migration files
│   │   └── 001_initial_schema.sql  # Creates all tables + PostGIS
│   └── seeds/                   # Seed data scripts
├── scripts/                     # Deployment helpers (kiosk launcher, systemd)
├── docker-compose.yml           # PostgreSQL container definition
└── docs/                        # This documentation
```

The backend listens on **port 8000**, the frontend on **port 5173**, and PostgreSQL on **port 15432** (exposed from the Docker container).

---

## 3. Start the Database

PUSECGIS uses PostgreSQL 16 with the PostGIS extension for spatial queries. Docker Compose handles this for you — no need to install PostgreSQL locally.

```bash
docker compose up -d db
```

**What this does:**

- Pulls the `postgis/postgis:16-3.4` image (if you don't already have it cached)
- Starts a container named `pusecgis-db`
- Maps host port 15432 to the container's internal port 5432
- Initializes the database with user `pusecgis`, database `pusecgis_dev`, and your migration files
- Runs a health check every 10 seconds until PostgreSQL is ready to accept connections

Wait for the database to be ready:

```bash
docker compose ps
```

You should see the `db` service as `healthy`. If it shows `starting`, wait another 10–15 seconds and try again.

---

## 4. Set Up the Backend

The backend is a FastAPI application written in Python 3.11+. It uses SQLAlchemy (async) with asyncpg for database access, and Pydantic v2 for request/response validation.

### 4.1 Create the virtual environment

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

Your prompt should change to indicate the environment is active:

```
(.venv) $
```

### 4.2 Install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

This installs all the packages listed in `requirements.txt`:

- **FastAPI** + **uvicorn** — web framework and ASGI server
- **SQLAlchemy** (2.0+) + **asyncpg** — async database layer
- **GeoAlchemy2** — PostGIS integration with SQLAlchemy
- **pydantic** (2.0+) + **pydantic-settings** — data validation and config
- **python-jose** + **passlib[bcrypt]** — JWT auth and password hashing

### 4.3 Configure environment variables

PUSECGIS reads configuration from environment variables with the `PUBSECGIS_` prefix. For local development, the defaults in `backend/config.py` work out of the box:

- `PUBSECGIS_DATABASE_URL` — `postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev`
- `PUBSECGIS_SECRET_KEY` — `change-me-in-production`
- `PUBSECGIS_ALGORITHM` — `HS256`
- `PUBSECGIS_ACCESS_TOKEN_EXPIRE_MINUTES` — `480`

If you need custom values, create a `.env` file in the `backend/` directory:

```bash
cat > .env <<EOF
PUBSECGIS_DATABASE_URL=postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev
PUBSECGIS_SECRET_KEY=your-secret-key-here
EOF
```

The app picks up `.env` automatically through Pydantic Settings.

### 4.4 Run the backend

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The `--reload` flag enables auto-reload: any change to your Python files triggers a server restart. Leave this terminal open.

---

## 5. Set Up the Frontend

The frontend is a React 18 single-page application built with Vite 5 and TypeScript. It serves the officer dashboard, broadcast screens, and interactive map views.

```bash
cd ../frontend
npm install
```

This installs all dependencies listed in `frontend/package.json`, including React, Leaflet (mapping), Recharts (data visualization), and the test tooling stack.

### 5.1 Start the dev server

```bash
npm run dev
```

Vite starts on `http://0.0.0.0:5173` and serves the React app. It also proxies `/api/*` requests to the backend at `http://localhost:8000`, so your frontend API calls go directly to the FastAPI server without needing CORS configuration.

Leave this terminal open in a separate window.

---

## 6. Verify Everything Works

Open three new terminal tabs and run these checks.

### 6.1 Backend API docs

```bash
curl -s http://localhost:8000/docs | grep -o '<title>[^<]*</title>'
```

You should see `Swagger UI` in the output. This confirms the FastAPI app is running and its OpenAPI docs are accessible.

Alternatively, open **http://localhost:8000/docs** in a browser to see the interactive Swagger UI with all documented endpoints.

### 6.2 Health check endpoint

```bash
curl -s http://localhost:8000/api/health | python3 -m json.tool
```

A healthy response looks like:

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "database": "connected"
}
```

### 6.3 Frontend dev server

Open **http://localhost:5173** in your browser. You should see the PUSECGIS officer dashboard with a Leaflet map, incident list sidebar, and login form.

If the map shows tiles but no incidents, that's expected — the database is empty. Run the seed script to populate data:

```bash
# From the project root, in a new terminal:
python3 scripts/seed_incidents.py
```

### 6.4 Full end-to-end check

| Service | URL | Expected |
|---------|-----|----------|
| Backend API docs | http://localhost:8000/docs | Swagger UI page |
| Backend health | http://localhost:8000/api/health | `{"status": "healthy"}` |
| Frontend app | http://localhost:5173 | React officer dashboard |
| Docker DB | (no URL) | `docker compose ps` shows `healthy` |

---

## 7. Running Tests

### Backend tests

```bash
cd backend
source .venv/bin/activate
python -m pytest tests/
```

### Frontend tests

```bash
cd frontend
npm run test
```

---

## 8. Troubleshooting

### Port already in use

**Problem:** `Address already in use` when starting the backend or frontend.

**Solution:** Find and kill the process using the port.

```bash
# Find what's on port 8000
lsof -i :8000

# Or port 5173
lsof -i :5173

# Kill the process (replace PID with the actual number)
kill -9 <PID>
```

### Docker won't start

**Problem:** `docker compose up db` fails with an image pull error or port conflict.

**Solution:**

```bash
# Check if another container uses port 15432
docker ps --format '{{.Names}} {{Ports}}' | grep 15432

# Stop and remove any existing PUSECGIS containers
docker compose down

# Pull the image fresh
docker pull postgis/postgis:16-3.4

# Start again
docker compose up db
```

### Database connection refused

**Problem:** Backend logs `ConnectionRefusedError` or `asyncpg.exceptions.ConnectionDoesNotExistError`.

**Solution:**

```bash
# Make sure the database container is running and healthy
docker compose ps

# Check the container logs
docker compose logs db

# Test the connection manually
PGPASSWORD=pusecgis_dev psql -h localhost -p 15432 -U pusecgis -d pusecgis_dev -c "SELECT 1;"

# If that fails, the DB container may not be ready yet — wait and retry
```

If PostgreSQL starts but migrations didn't run, initialize the schema manually:

```bash
PGPASSWORD=pusecgis_dev psql -h localhost -p 15432 -U pusecgis -d pusecgis_dev -f database/migrations/001_initial_schema.sql
```

### Frontend can't reach the API

**Problem:** The React app shows network errors when loading incidents or posting data.

**Solution:**

```bash
# Verify the backend is actually running
curl -s http://localhost:8000/api/health

# Check the Vite proxy config (frontend/vite.config.ts)
# The /api proxy targets http://localhost:8000 by default

# If your backend runs on a different port, update vite.config.ts:
# server.proxy['/api'].target = 'http://localhost:YOUR_PORT'

# Check browser DevTools Console for CORS errors (should not appear —
# Vite's proxy handles this)
```

### Virtual environment issues

**Problem:** `ModuleNotFoundError` when running the backend.

**Solution:**

```bash
cd backend
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

If the venv is corrupted, recreate it:

```bash
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Node.js version mismatch

**Problem:** `npm install` fails with `engines` errors or `ERR! not ok`.

**Solution:**

```bash
# Check your Node version
node --version

# If below 18, upgrade via your package manager
# Ubuntu/Debian:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Or use nvm (Node Version Manager):
nvm install 20
nvm use 20
```

### Docker daemon not running

**Problem:** `Cannot connect to the Docker daemon`.

**Solution:**

```bash
# Start Docker (Ubuntu/Debian)
sudo systemctl --user start docker

# Add your user to the docker group to avoid sudo (one-time setup)
sudo usermod -aG docker $USER
# Log out and back in for the change to take effect
```

### Missing Python modules after upgrade

**Problem:** After updating Python or system packages, `asyncpg` or `geoalchemy2` fail to import.

**Solution:**

```bash
cd backend
source .venv/bin/activate
# Rebuild the extensions (these compile C extensions)
pip install --force-reinstall -r requirements.txt
```

---

## Next Steps

- Read the [MVP specification](../mvp-spec.md) to understand the data model and UI modes
- Explore the [API reference](http://localhost:8000/docs) generated from the code
- Check [DEPLOYMENT.md](./DEPLOYMENT.md) when you're ready to deploy to a production server with systemd and Nginx
