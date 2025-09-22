#!/bin/bash

log() {
    echo "[$(date -Iseconds)] disconnect-vpn: $1"
}

log "Disconnecting Mullvad VPN..."

# Bring down WireGuard interface
if wg show mullvad >/dev/null 2>&1; then
    log "Bringing down WireGuard interface..."
    wg-quick down mullvad || log "WARN: Failed to cleanly bring down WireGuard interface"
else
    log "WireGuard interface not active"
fi

# Restore original DNS configuration
if [ -f /etc/resolv.conf.backup ]; then
    log "Restoring original DNS configuration..."
    mv /etc/resolv.conf.backup /etc/resolv.conf
fi

# Clean up configuration files (optional, for security)
if [ "${MULLVAD_CLEANUP_CONFIG:-false}" = "true" ]; then
    log "Cleaning up VPN configuration files..."
    rm -f /etc/wireguard/mullvad.conf
fi

# Clean up temporary files
rm -f /tmp/mullvad_ip /tmp/mullvad_location

log "VPN disconnection completed"