#!/bin/bash
set -e

log() {
    echo "[$(date -Iseconds)] setup-vpn: $1"
}

log "Setting up Mullvad VPN connection..."

# Create WireGuard configuration
log "Generating WireGuard configuration..."

# Generate WireGuard key pair
log "Generating WireGuard key pair..."
PRIVATE_KEY=$(wg genkey)
PUBLIC_KEY=$(echo "$PRIVATE_KEY" | wg pubkey)

log "Generated keys. Public key: ${PUBLIC_KEY:0:16}..."

# Use Mullvad's API to get WireGuard configuration
MULLVAD_RELAY="${MULLVAD_RELAY_LOCATION:-us-nyc-wg-301}"

# Create temporary directory for configuration
TEMP_DIR=$(mktemp -d)
CONFIG_FILE="$TEMP_DIR/mullvad.conf"

# Authenticate with Mullvad API (2025 method)
log "Authenticating with Mullvad API..."
ACCESS_TOKEN=$(curl -sS -X POST 'https://api.mullvad.net/auth/v1/token' \
    -H 'accept: application/json' \
    -H 'content-type: application/json' \
    -d "{\"account_number\": \"$MULLVAD_ACCOUNT_TOKEN\"}" \
    | jq -r '.access_token // empty')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
    log "ERROR: Failed to authenticate with Mullvad API"
    rm -rf "$TEMP_DIR"
    exit 1
fi

log "Successfully authenticated with Mullvad API"

# Use a consistent device name to avoid creating multiple devices
DEVICE_NAME="${MULLVAD_DEVICE_NAME:-scraper-github-actions}"

# Check if device already exists
log "Checking for existing device: $DEVICE_NAME"
EXISTING_DEVICES=$(curl -sS -X GET 'https://api.mullvad.net/accounts/v1/devices' \
    -H "Authorization: Bearer $ACCESS_TOKEN")

EXISTING_DEVICE=$(echo "$EXISTING_DEVICES" | jq -r ".[] | select(.name==\"$DEVICE_NAME\")")

if [ -n "$EXISTING_DEVICE" ] && [ "$EXISTING_DEVICE" != "null" ]; then
    log "Found existing device: $DEVICE_NAME"

    # Update existing device with new public key
    DEVICE_ID=$(echo "$EXISTING_DEVICE" | jq -r '.id')
    log "Updating existing device $DEVICE_ID with new public key..."

    DEVICE_RESPONSE=$(curl -sS -X PATCH "https://api.mullvad.net/accounts/v1/devices/$DEVICE_ID" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -H 'content-type: application/json' \
        -d "{\"pubkey\":\"$PUBLIC_KEY\",\"hijack_dns\":false}")
else
    log "Creating new WireGuard device: $DEVICE_NAME"
    DEVICE_RESPONSE=$(curl -sS -X POST 'https://api.mullvad.net/accounts/v1/devices' \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -H 'content-type: application/json' \
        -d "{\"pubkey\":\"$PUBLIC_KEY\",\"hijack_dns\":false,\"name\":\"$DEVICE_NAME\"}")
fi

# Extract device info
DEVICE_IPV4=$(echo "$DEVICE_RESPONSE" | jq -r '.ipv4_address // empty')
DEVICE_IPV6=$(echo "$DEVICE_RESPONSE" | jq -r '.ipv6_address // empty')

if [ -z "$DEVICE_IPV4" ] || [ "$DEVICE_IPV4" = "null" ]; then
    log "ERROR: Failed to create/update WireGuard device"
    log "API Response: $DEVICE_RESPONSE"
    rm -rf "$TEMP_DIR"
    exit 1
fi

log "Device created successfully. IPv4: $DEVICE_IPV4"

# Get relay information from Mullvad API
RELAY_COUNTRY="${MULLVAD_RELAY_COUNTRY:-us}"
RELAY_CITY="${MULLVAD_RELAY_CITY:-qas}"  # Use Ashburn instead of NYC for better availability

log "Fetching relay server information..."
RELAY_INFO=$(curl -sS "https://api.mullvad.net/public/relays/wireguard/v1/" | \
    jq -r ".countries[] | select(.code==\"$RELAY_COUNTRY\") | .cities[] | select(.code==\"$RELAY_CITY\") | .relays[0]")

if [ -z "$RELAY_INFO" ] || [ "$RELAY_INFO" = "null" ]; then
    log "ERROR: No relay server found for $RELAY_COUNTRY-$RELAY_CITY"
    rm -rf "$TEMP_DIR"
    exit 1
fi

RELAY_IP=$(echo "$RELAY_INFO" | jq -r '.ipv4_addr_in')
RELAY_PUBKEY=$(echo "$RELAY_INFO" | jq -r '.public_key')
RELAY_HOSTNAME=$(echo "$RELAY_INFO" | jq -r '.hostname')

log "Selected relay: $RELAY_HOSTNAME ($RELAY_IP)"

# Generate WireGuard configuration using IP address
log "Generating WireGuard configuration..."
cat > "$CONFIG_FILE" << EOF
[Interface]
PrivateKey = $PRIVATE_KEY
Address = $DEVICE_IPV4
DNS = 10.64.0.1

[Peer]
PublicKey = $RELAY_PUBKEY
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = $RELAY_IP:51820
EOF

log "Using endpoint: $RELAY_IP:51820 ($RELAY_HOSTNAME)"

# Validate the configuration file
if [ ! -s "$CONFIG_FILE" ]; then
    log "ERROR: Empty configuration file received from Mullvad API"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Check if the config looks valid (contains [Interface] and [Peer] sections)
if ! grep -q "\[Interface\]" "$CONFIG_FILE" || ! grep -q "\[Peer\]" "$CONFIG_FILE"; then
    log "ERROR: Invalid WireGuard configuration received"
    log "Config content: $(head -5 "$CONFIG_FILE")"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Configuration is already complete with private key

# Move configuration to the proper location
mv "$CONFIG_FILE" /etc/wireguard/mullvad.conf
chmod 600 /etc/wireguard/mullvad.conf

# Clean up temporary directory
rm -rf "$TEMP_DIR"

# Start WireGuard interface
log "Starting WireGuard interface..."
if ! wg-quick up mullvad; then
    log "ERROR: Failed to bring up WireGuard interface"
    exit 1
fi

# Verify the interface is up
if ! wg show mullvad >/dev/null 2>&1; then
    log "ERROR: WireGuard interface not found after setup"
    exit 1
fi

# Configure routing to ensure all traffic goes through VPN
log "Configuring routing for VPN traffic..."

# Add route for all traffic through VPN (if not already configured in WireGuard)
# This depends on the specific WireGuard configuration from Mullvad

# Set DNS to Mullvad's DNS servers to prevent leaks
if [ -f /etc/resolv.conf ]; then
    cp /etc/resolv.conf /etc/resolv.conf.backup
fi

cat > /etc/resolv.conf << EOF
# Mullvad DNS servers (AdGuard DNS)
nameserver 194.242.2.2
nameserver 194.242.2.3
# Fallback to Mullvad's own DNS
nameserver 10.64.0.1
EOF

log "VPN setup completed successfully"
exit 0