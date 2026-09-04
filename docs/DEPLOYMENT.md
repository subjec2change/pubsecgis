# PUSECGIS Broadcast Screen Deployment Guide

> **Status:** Phase 1 — MVP Core Deployment
> **Target:** BJC Internal Network — 6 Broadcast Screens

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Systemd Service Setup](#systemd-service-setup)
5. [Manual Launch](#manual-launch)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Hardware

- Ubuntu 20.04+ or 22.04 LTS (x86_64)
- Chrome 90+ installed
- 64-bit capable CPU (all modern systems)
- Minimum 4GB RAM (8GB recommended)

### Software

- PostgreSQL 16 with PostGIS 3.4 extension
- Python 3.11+ (backend)
- Node.js 18+ (frontend build)
- Nginx (reverse proxy)
- Google Chrome (kiosk display)

### Network

- Internal BJC network access only
- PostgreSQL accessible on port 15432
- Frontend on port 5173 (dev) or 80 (prod via Nginx)
- No internet dependency required

---

## Installation

### 1. Clone the Repository

```bash
sudo mkdir -p /opt/pubsecgis
sudo git clone https://github.com/subjec2change/pubsecgis.git /opt/pubsecgis
sudo chown -R $USER:$USER /opt/pubsecgis
cd /opt/pubsecgis
```

### 2. Install PostgreSQL + PostGIS

```bash
# Install PostgreSQL and PostGIS
sudo apt update
sudo apt install -y postgresql-16-postgis-3

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify installation
sudo -u postgres psql -c "SELECT version();"
sudo -u postgres psql -c "SELECT PostGIS_full_version();"
```

### 3. Setup Database

```bash
# Create database and user
sudo -u postgres psql <<EOF
CREATE USER pusecgis WITH PASSWORD 'pusecgis_dev';
CREATE DATABASE pusecgis_dev OWNER pusecgis;
GRANT ALL PRIVILEGES ON DATABASE pusecgis_dev TO pusecgis;
EOF

# Grant PostGIS access
sudo -u postgres psql -d pusecgis_dev -c "CREATE EXTENSION IF NOT EXISTS postgis;"
sudo -u postgres psql -d pusecgis_dev -c "GRANT ALL ON SCHEMA public TO pusecgis;"

# Verify PostGIS is active
sudo -u postgres psql -d pusecgis_dev -c "SELECT PostGIS_version();"
```

### 4. Apply Database Migrations

```bash
cd /opt/pubsecgis

# Run all migrations in order
sudo -u postgres psql -d pusecgis_dev -f database/migrations/001_initial_schema.sql
sudo -u postgres psql -d pusecgis_dev -f database/migrations/002_archive_support.sql
sudo -u postgres psql -d pusecgis_dev -f database/migrations/003_response_phase.sql

# Verify tables
sudo -u postgres psql -d pusecgis_dev -c "\dt"
```

### 5. Install Backend Dependencies

```bash
cd /opt/pubsecgis/backend

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Verify FastAPI works
curl -s http://localhost:8000/api/health || echo "Backend not running yet (expected)"
```

### 6. Build Frontend

```bash
cd /opt/pubsecgis/frontend

# Install Node dependencies
npm install

# Build for production
npm run build

# Verify build output
ls -la dist/
```

### 7. Install Chrome

```bash
# Chrome should already be installed on most systems
google-chrome --version

# If not installed:
curl https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/chrome.deb
sudo apt install -y /tmp/chrome.deb
rm /tmp/chrome.deb

# Verify installation
google-chrome --version
```

### 8. Configure Nginx (Optional)

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx configuration (example)
sudo tee /etc/nginx/sites-available/pubsecgis > /dev/null <<EOF
server {
    listen 80;
    server_name _;

    # Frontend static files
    location / {
        root /opt/pubsecgis/frontend/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

# Enable site and test config
sudo ln -sf /etc/nginx/sites-available/pubsecgis /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Configuration

### Environment Variables

Create `/etc/default/pubsecgis` or use environment files:

```bash
# Database connection
PUBSECGIS_DATABASE_URL=postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev

# Secret key for JWT (CHANGE IN PRODUCTION!)
PUBSECGIS_SECRET_KEY=change-me-in-production

# Algorithm (default: HS256)
PUBSECGIS_ALGORITHM=HS256

# Token expiry in minutes (default: 480 = 8 hours)
PUBSECGIS_ACCESS_TOKEN_EXPIRE_MINUTES=480
```

### Backend Configuration

Edit `backend/config.py` or use environment variables (prefixed with `PUBSECGIS_`):

```python
# In backend/config.py or via env vars
class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://pusecgis:pusecgis_dev@localhost:15432/pusecgis_dev"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
```

### Nginx Configuration (if using)

Edit `/etc/nginx/sites-available/pubsecgis`:

```nginx
server {
    listen 80;
    server_name your-server-ip-or-hostname;

    # Frontend static files
    location / {
        root /opt/pubsecgis/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Broadcast pages (static)
    location /broadcast {
        root /opt/pubsecgis/frontend/dist;
        try_files $uri /index.html;
    }
}
```

---

## Systemd Service Setup

### Backend Service

Create `/etc/systemd/system/pusecgis-backend.service`:

```ini
[Unit]
Description=PUSECGIS FastAPI Backend
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/pubsecgis/backend
ExecStart=/opt/pubsecgis/backend/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
Environment=PATH=/opt/pubsecgis/backend/.venv/bin:$PATH
EnvironmentFile=/etc/default/pubsecgis

[Install]
WantedBy=multi-user.target
```

### Kiosk Screen Service

Copy the service file:

```bash
sudo cp scripts/pusecgis-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
```

### Enable Services

```bash
# Backend
sudo systemctl enable pusecgis-backend.service
sudo systemctl start pusecgis-backend.service

# Broadcast screens (one per screen)
for screen in main satellite1 satellite2 satellite3 childrens adulted; do
    sudo systemctl enable pusecgis-kiosk@$screen.service
    sudo systemctl start pusecgis-kiosk@$screen.service
done

# Verify all services
systemctl status pusecgis-backend.service
systemctl status pusecgis-kiosk@main.service
systemctl list-units 'pusecgis-*' --no-pager
```

---

## Manual Launch

### Quick Start (Development)

```bash
# Terminal 1: Backend
cd /opt/pubsecgis/backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000

# Terminal 2: Frontend
cd /opt/pubsecgis/frontend
npm run build  # or npm run dev for development

# Terminal 3: Kiosk screen (optional)
chmod +x scripts/kiosk-launch.sh
./scripts/kiosk-launch.sh http://localhost:5173/broadcast?screen=main main
```

### Manual Kiosk Launch

```bash
# Make script executable
chmod +x scripts/kiosk-launch.sh

# Launch with specific screen
./scripts/kiosk-launch.sh http://localhost:5173/broadcast?screen=satellite1 satellite1

# Or use systemd service
sudo systemctl start pusecgis-kiosk@satellite1.service

# Check logs
tail -f /var/log/pusecgis-kiosk/satellite1.log
```

### Service Management

```bash
# Start/stop/restart
sudo systemctl start pusecgis-kiosk@main.service
sudo systemctl stop pusecgis-kiosk@main.service
sudo systemctl restart pusecgis-kiosk@main.service

# View logs
sudo journalctl -u pusecgis-kiosk@main.service -f
sudo tail -f /var/log/pusecgis-kiosk/main.log

# Check status
sudo systemctl status pusecgis-kiosk@main.service
```

---

## Verification

### 1. Check Database

```bash
sudo -u postgres psql -d pusecgis_dev -c "\dt"
sudo -u postgres psql -d pusecgis_dev -c "SELECT PostGIS_version();"
sudo -u postgres psql -d pusecgis_dev -c "SELECT count(*) FROM incidents;"
```

### 2. Check Backend

```bash
curl -s http://localhost:8000/api/health | jq .
curl -s http://localhost:8000/docs | head -20
```

### 3. Check Frontend

```bash
curl -s http://localhost:5173 | grep -o '<title>[^<]*</title>'
curl -s http://localhost:8080 | grep -o '<title>[^<]*</title>'  # If using Nginx
```

### 4. Check Kiosk Screen

```bash
# Check if Chrome is running
ps aux | grep chrome | grep kiosk

# Check logs
tail -20 /var/log/pusecgis-kiosk/main.log

# Verify fullscreen
google-chrome --version
```

### 5. Check Services

```bash
systemctl list-units 'pusecgis-*' --no-pager --state=running
```

---

## Troubleshooting

### Chrome Fullscreen Issues

**Problem:** Chrome doesn't enter fullscreen mode

**Solution:**
```bash
# Check Chrome flags in kiosk-launch.sh
# Ensure --kiosk flag is present
# Try manual fullscreen test:
google-chrome --kiosk --disable-gpu http://localhost:5173/broadcast?screen=main
```

### Database Connection Failed

**Problem:** Backend can't connect to PostgreSQL

**Solution:**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection string
echo $PUBSECGIS_DATABASE_URL

# Test connection manually
psql -h localhost -p 15432 -U pusecgis -d pusecgis_dev -c "SELECT 1;"

# Check firewall
sudo ufw status
```

### Frontend Build Errors

**Problem:** `npm run build` fails

**Solution:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node version
node --version  # Should be 18+

# Check for TypeScript errors
npx tsc --noEmit
```

### Nginx Not Serving Files

**Problem:** 404 or 502 errors

**Solution:**
```bash
# Check Nginx config
sudo nginx -t

# Check Nginx status
sudo systemctl status nginx

# Check error logs
sudo tail -f /var/log/nginx/error.log

# Check file permissions
ls -la /opt/pubsecgis/frontend/dist/
```

### Service Won't Start

**Problem:** systemd service fails to start

**Solution:**
```bash
# Check service status
sudo systemctl status pusecgis-kiosk@main.service

# Check service logs
sudo journalctl -u pusecgis-kiosk@main.service -n 50

# Check if port is in use
sudo lsof -i :8000
sudo lsof -i :5173

# Check User/Group in service file
grep -E "User=|Group=" /etc/systemd/system/pusecgis-kiosk.service

# Verify executable permissions
ls -la scripts/kiosk-launch.sh
chmod +x scripts/kiosk-launch.sh
```

### Broadcast Page Not Updating

**Problem:** Incidents don't appear on broadcast screen

**Solution:**
```bash
# Check backend is running
curl -s http://localhost:8000/api/incidents

# Check database has data
sudo -u postgres psql -d pusecgis_dev -c "SELECT count(*) FROM incidents;"

# Check refresh interval (default: 30 seconds)
grep "REFRESH_INTERVAL" frontend/src/components/BroadcastPage.tsx

# Check browser console for errors
# In Chrome: F12 > Console tab
```

### General Logs

```bash
# Backend logs
tail -f /opt/pubsecgis/backend/.venv/logs/uvicorn.log 2>/dev/null || journalctl -u pusecgis-backend.service -f

# Kiosk logs
tail -f /var/log/pusecgis-kiosk/main.log

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Screen URLs

| Screen | URL |
|--------|-----|
| Main Control | `http://server-ip/broadcast?screen=main` |
| Satellite 1 | `http://server-ip/broadcast?screen=satellite1` |
| Satellite 2 | `http://server-ip/broadcast?screen=satellite2` |
| Satellite 3 | `http://server-ip/broadcast?screen=satellite3` |
| Children's ED | `http://server-ip/broadcast?screen=childrens` |
| Adult ED | `http://server-ip/broadcast?screen=adulted` |
| Officer Login | `http://server-ip/login` |
| Officer Dashboard | `http://server-ip/officer` |
| API Docs | `http://server-ip/docs` |

---

## Contact

For issues, check logs first, then consult this guide.

> **Note:** This deployment is for internal BJC network only. No external internet access is required.
