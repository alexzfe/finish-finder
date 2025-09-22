#!/bin/bash

# Health check script for Docker container
# Returns 0 if healthy, 1 if unhealthy

log() {
    echo "[$(date -Iseconds)] health-check: $1"
}

# Check if VPN is enabled
if [ "${MULLVAD_VPN_ENABLED:-true}" = "false" ]; then
    # VPN disabled, just check if we can reach the internet
    if curl -s --max-time 5 https://httpbin.org/ip >/dev/null; then
        exit 0
    else
        log "Health check failed: Cannot reach internet"
        exit 1
    fi
fi

# VPN is enabled, perform comprehensive health check

# 1. Check if WireGuard interface is up
if ! wg show mullvad >/dev/null 2>&1; then
    log "Health check failed: WireGuard interface is down"
    exit 1
fi

# 2. Check if we can reach Mullvad's check service
if ! curl -s --max-time 10 https://am.i.mullvad.net/json >/dev/null; then
    log "Health check failed: Cannot reach Mullvad check service"
    exit 1
fi

# 3. Verify we're actually using Mullvad
MULLVAD_CHECK=$(curl -s --max-time 10 https://am.i.mullvad.net/json 2>/dev/null || echo '{"mullvad_exit_ip": false}')
IS_MULLVAD=$(echo "$MULLVAD_CHECK" | jq -r '.mullvad_exit_ip // false' 2>/dev/null || echo "false")

if [ "$IS_MULLVAD" != "true" ]; then
    log "Health check failed: Not connected through Mullvad VPN"
    exit 1
fi

# All checks passed
exit 0