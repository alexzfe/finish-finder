#!/bin/bash

# Test script for VPN-enabled scraper
# Usage: ./scripts/test-vpn-scraper.sh [with-vpn|without-vpn]

set -e

# Configuration
DOCKER_IMAGE="finish-finder-scraper-vpn"
VPN_MODE="${1:-with-vpn}"

echo "Testing scraper with VPN mode: $VPN_MODE"

# Check if required environment variables are set
if [ "$VPN_MODE" = "with-vpn" ]; then
    if [ -z "$MULLVAD_ACCOUNT_TOKEN" ]; then
        echo "ERROR: MULLVAD_ACCOUNT_TOKEN environment variable is required for VPN testing"
        echo "Please set it with: export MULLVAD_ACCOUNT_TOKEN=your_token_here"
        exit 1
    fi
fi

# Build the container
echo "Building VPN-enabled scraper container..."
docker build -f docker/mullvad/Dockerfile -t "$DOCKER_IMAGE" .

# Set up environment variables
ENV_VARS=(
    "-e NODE_ENV=development"
    "-e DATABASE_URL=${DATABASE_URL:-file:./prisma/dev.db}"
    "-e OPENAI_API_KEY=${OPENAI_API_KEY}"
)

# Add VPN-specific variables
if [ "$VPN_MODE" = "with-vpn" ]; then
    ENV_VARS+=(
        "-e MULLVAD_VPN_ENABLED=true"
        "-e MULLVAD_ACCOUNT_TOKEN=${MULLVAD_ACCOUNT_TOKEN}"
        "-e MULLVAD_RELAY_LOCATION=${MULLVAD_RELAY_LOCATION:-us-nyc-wg-301}"
        "-e MULLVAD_FALLBACK_NO_VPN=true"
        "-e MULLVAD_MONITOR_INTERVAL=60"
        "-e MULLVAD_MAX_FAILURES=2"
    )

    DOCKER_OPTS="--privileged --cap-add=NET_ADMIN --cap-add=SYS_MODULE"
else
    ENV_VARS+=(
        "-e MULLVAD_VPN_ENABLED=false"
    )
    DOCKER_OPTS=""
fi

# Run the container
echo "Running scraper container..."
echo "VPN enabled: $VPN_MODE"
echo "Environment variables: ${ENV_VARS[*]}"

# Start container with health monitoring
docker run --rm \
    $DOCKER_OPTS \
    "${ENV_VARS[@]}" \
    --name test-vpn-scraper \
    "$DOCKER_IMAGE" &

CONTAINER_PID=$!

# Function to cleanup on exit
cleanup() {
    echo "Stopping test container..."
    docker stop test-vpn-scraper 2>/dev/null || true
    exit 0
}

trap cleanup SIGTERM SIGINT

# Monitor the container
echo "Container started (PID: $CONTAINER_PID)"
echo "Press Ctrl+C to stop the test"

# Wait for container to finish or be interrupted
wait $CONTAINER_PID

echo "Test completed"