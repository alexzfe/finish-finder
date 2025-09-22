#!/bin/bash
set -e

log() {
    echo "[$(date -Iseconds)] verify-connection: $1"
}

log "Verifying VPN connection..."

# Get current external IP
CURRENT_IP=$(curl -s --max-time 10 https://ipinfo.io/ip || echo "unknown")

if [ "$CURRENT_IP" = "unknown" ]; then
    log "WARN: Could not determine external IP address"
    return 1
fi

log "Current external IP: $CURRENT_IP"

# Check if we're connected to Mullvad
# Mullvad provides an API to check if the IP is from their network
MULLVAD_CHECK=$(curl -s --max-time 10 https://am.i.mullvad.net/json || echo '{"mullvad_exit_ip": false}')

IS_MULLVAD=$(echo "$MULLVAD_CHECK" | jq -r '.mullvad_exit_ip // false')
MULLVAD_COUNTRY=$(echo "$MULLVAD_CHECK" | jq -r '.country // "unknown"')
MULLVAD_CITY=$(echo "$MULLVAD_CHECK" | jq -r '.city // "unknown"')

if [ "$IS_MULLVAD" = "true" ]; then
    log "✅ Successfully connected through Mullvad VPN"
    log "Location: $MULLVAD_CITY, $MULLVAD_COUNTRY"

    # Store connection info for monitoring
    echo "$CURRENT_IP" > /tmp/mullvad_ip
    echo "$MULLVAD_CITY, $MULLVAD_COUNTRY" > /tmp/mullvad_location

    return 0
else
    log "❌ NOT connected through Mullvad VPN"
    log "Current IP appears to be: $CURRENT_IP"

    # Additional debugging information
    log "Full Mullvad check response: $MULLVAD_CHECK"

    return 1
fi