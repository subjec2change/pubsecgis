#!/bin/bash
#
# Kiosk Launcher — launches Chrome in fullscreen/kiosk mode for broadcast screens
# Auto-restarts on crash, prevents normal browser navigation
#
# Usage: ./kiosk-launch.sh [broadcast-url] [screen-name]
#   broadcast-url: URL to display (default: http://localhost:5173/broadcast)
#   screen-name: Optional label for logging (default: "kiosk")
#

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
BROWSER="${BROWSER:-google-chrome}"
CHROME_FLAGS=(
  --kiosk                        # Fullscreen, no window decorations
  --disable-gpu                  # Avoid GPU issues in headless/container
  --disable-infobars             # Hide "Chrome is being controlled" message
  --no-first-run                 # Skip first-run wizard
  --no-default-browser-check     # Skip browser check dialog
  --disable-features=Sidebar     # Disable Chrome sidebar
  --disable-popup-blocking       # Prevent popup blocks
  --disable-session-crashed-bubble  # Skip "restore session" popup
  --enable-strict-keyboard-access  # Enhance kiosk security
  --enable-features=NetworkServiceOutOfProcess  # Better stability
  --overscroll-history-navigation=0  # Disable back/forward swipe
  --edge-compose-disable-arc-window  # Disable unnecessary UI
  --disable-features=TranslateUI --disable-features=PasswordManager
)

# URL to display
BROADCAST_URL="${1:-http://localhost:5173/broadcast?screen=main}"
SCREEN_NAME="${2:-kiosk}"

# Log file location
LOG_DIR="${KIOSK_LOG_DIR:-/var/log/pusecgis-kiosk}"
LOG_FILE="${LOG_DIR}/${SCREEN_NAME}.log"

# ─── Setup ────────────────────────────────────────────────────────────────────

# Create log directory
mkdir -p "${LOG_DIR}"

log() {
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[${timestamp}] ${SCREEN_NAME}: $1" | tee -a "${LOG_FILE}"
}

# ─── Validation ───────────────────────────────────────────────────────────────

if ! command -v "${BROWSER}" &>/dev/null; then
  log "ERROR: Browser '${BROWSER}' not found. Install Chrome or set BROWSER variable."
  exit 1
fi

log "Starting kiosk: ${SCREEN_NAME}"
log "URL: ${BROADCAST_URL}"
log "Browser: ${BROWSER}"

# ─── Launch Loop ──────────────────────────────────────────────────────────────

EXIT_CODE=0
RESTART_DELAY=5
MAX_CRASHES=10  # Max consecutive crashes before giving up
CRASH_COUNT=0

log "Entering launch loop (Ctrl+C to stop)"

while true; do
  log "Launching browser (attempt $((CRASH_COUNT + 1)))..."
  
  "${BROWSER}" "${CHROME_FLAGS[@]}" "${BROADCAST_URL}" 2>>"${LOG_FILE}"
  EXIT_CODE=$?
  
  log "Browser exited with code ${EXIT_CODE}"
  
  if [[ ${EXIT_CODE} -eq 0 ]]; then
    # Clean exit (user closed it intentionally)
    log "Browser exited cleanly. Stopping kiosk."
    break
  fi
  
  CRASH_COUNT=$((CRASH_COUNT + 1))
  
  if [[ ${CRASH_COUNT} -ge ${MAX_CRASHES} ]]; then
    log "ERROR: ${CRASH_COUNT} consecutive crashes. Aborting."
    exit 1
  fi
  
  log "Crash detected. Restarting in ${RESTART_DELAY} seconds..."
  sleep "${RESTART_DELAY}"
done
