#!/bin/bash
set -e

echo "Starting Mullvad VPN-enabled scraper container..."

# Function to log with timestamp
log() {
    echo "[$(date -Iseconds)] $1"
}

# Function to cleanup on exit
cleanup() {
    log "Shutting down VPN connection..."
    /opt/mullvad/disconnect-vpn.sh || true
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Check if VPN should be enabled
if [ "${MULLVAD_VPN_ENABLED:-true}" = "true" ]; then
    log "VPN enabled - configuring Mullvad connection..."

    # Validate required environment variables
    if [ -z "$MULLVAD_ACCOUNT_TOKEN" ]; then
        log "ERROR: MULLVAD_ACCOUNT_TOKEN is required when VPN is enabled"
        exit 1
    fi

    # Configure and connect to VPN
    if ! /opt/mullvad/setup-vpn.sh; then
        log "ERROR: Failed to set up VPN connection"

        # Check if fallback is enabled
        if [ "${MULLVAD_FALLBACK_NO_VPN:-false}" = "true" ]; then
            log "WARN: VPN setup failed, continuing without VPN (fallback enabled)"
        else
            log "ERROR: VPN setup failed and fallback disabled, exiting"
            exit 1
        fi
    else
        log "VPN connection established successfully"

        # Verify external IP changed
        /opt/mullvad/verify-connection.sh

        # Set up connection monitoring
        /opt/mullvad/monitor-connection.sh &
        MONITOR_PID=$!
    fi
else
    log "VPN disabled - running scraper without VPN"
fi

# Start health check server
/opt/mullvad/health-server.sh &
HEALTH_PID=$!

# Start the main application
log "Starting scraper application..."
exec "$@"