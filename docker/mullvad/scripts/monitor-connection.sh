#!/bin/bash

log() {
    echo "[$(date -Iseconds)] monitor-connection: $1"
}

log "Starting VPN connection monitor..."

# Monitoring configuration
CHECK_INTERVAL=${MULLVAD_MONITOR_INTERVAL:-60}  # Check every 60 seconds
MAX_FAILURES=${MULLVAD_MAX_FAILURES:-3}         # Reconnect after 3 consecutive failures

failure_count=0

while true; do
    sleep "$CHECK_INTERVAL"

    # Check if WireGuard interface is still up
    if ! wg show mullvad >/dev/null 2>&1; then
        log "ERROR: WireGuard interface is down"
        ((failure_count++))
    else
        # Check if we can reach the internet through the VPN
        if curl -s --max-time 10 https://am.i.mullvad.net/json >/dev/null; then
            # Reset failure count on successful check
            if [ $failure_count -gt 0 ]; then
                log "Connection restored, resetting failure count"
                failure_count=0
            fi
        else
            log "ERROR: Cannot reach internet through VPN"
            ((failure_count++))
        fi
    fi

    # Attempt reconnection if too many failures
    if [ $failure_count -ge $MAX_FAILURES ]; then
        log "WARN: $failure_count consecutive failures, attempting reconnection..."

        # Try to reconnect
        /opt/mullvad/disconnect-vpn.sh
        sleep 5

        if /opt/mullvad/setup-vpn.sh; then
            log "Reconnection successful"
            failure_count=0
        else
            log "ERROR: Reconnection failed"

            # Check if we should fallback to no VPN
            if [ "${MULLVAD_FALLBACK_NO_VPN:-false}" = "true" ]; then
                log "WARN: Continuing without VPN (fallback enabled)"
                exit 0
            else
                log "ERROR: VPN reconnection failed and fallback disabled"
                exit 1
            fi
        fi
    fi
done