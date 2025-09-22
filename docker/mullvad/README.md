# Mullvad VPN Integration for Finish Finder Scraper

This directory contains the Docker-based Mullvad VPN integration that allows the scraper to bypass IP blocking from Sherdog and other sources.

## Overview

The VPN integration uses WireGuard protocol through Mullvad's API to establish secure tunneling for web scraping operations. The solution includes:

- **Automated VPN Setup**: Configures WireGuard using Mullvad's API
- **Connection Monitoring**: Continuously monitors VPN health and auto-reconnects
- **Fallback Support**: Can operate without VPN if connection fails
- **Health Checks**: Provides HTTP endpoints for monitoring
- **IP Verification**: Confirms traffic routes through Mullvad's network

## Prerequisites

1. **Active Mullvad VPN Account**: Get one at [mullvad.net](https://mullvad.net)
2. **Account Token**: Required for API access to generate WireGuard configs
3. **Docker with Privileged Access**: Required for network interface management

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `MULLVAD_ACCOUNT_TOKEN` | Your Mullvad account token | Yes (if VPN enabled) | - |
| `MULLVAD_VPN_ENABLED` | Enable/disable VPN functionality | No | `true` |
| `MULLVAD_RELAY_LOCATION` | Preferred relay server | No | `us-nyc-wg-301` |
| `MULLVAD_FALLBACK_NO_VPN` | Continue without VPN if setup fails | No | `false` |
| `MULLVAD_MONITOR_INTERVAL` | Health check interval (seconds) | No | `60` |
| `MULLVAD_MAX_FAILURES` | Reconnection threshold | No | `3` |
| `MULLVAD_CLEANUP_CONFIG` | Remove configs on shutdown | No | `false` |

### Available Relay Locations

Common Mullvad relay locations:
- `us-nyc-wg-301` - New York, USA
- `us-lax-wg-301` - Los Angeles, USA
- `ca-tor-wg-301` - Toronto, Canada
- `se-sto-wg-301` - Stockholm, Sweden
- `de-fra-wg-301` - Frankfurt, Germany

Find more at: https://mullvad.net/en/servers

## Usage

### GitHub Actions

The scraper automatically uses VPN in GitHub Actions. Configure secrets:

```bash
# Set your Mullvad account token
gh secret set MULLVAD_ACCOUNT_TOKEN --body "your_token_here"
```

### Local Development

1. **Set environment variables:**
```bash
export MULLVAD_ACCOUNT_TOKEN="your_token_here"
export MULLVAD_RELAY_LOCATION="us-nyc-wg-301"
```

2. **Test with VPN:**
```bash
./scripts/test-vpn-scraper.sh with-vpn
```

3. **Test without VPN:**
```bash
./scripts/test-vpn-scraper.sh without-vpn
```

### Manual Docker Run

```bash
# Build the container
docker build -f docker/mullvad/Dockerfile -t scraper-vpn .

# Run with VPN
docker run --rm --privileged \
  --cap-add=NET_ADMIN --cap-add=SYS_MODULE \
  -e MULLVAD_ACCOUNT_TOKEN="your_token" \
  -e MULLVAD_VPN_ENABLED="true" \
  -e DATABASE_URL="your_db_url" \
  -e OPENAI_API_KEY="your_openai_key" \
  scraper-vpn

# Run without VPN
docker run --rm \
  -e MULLVAD_VPN_ENABLED="false" \
  -e DATABASE_URL="your_db_url" \
  -e OPENAI_API_KEY="your_openai_key" \
  scraper-vpn
```

## Monitoring

### Health Check Endpoints

The container exposes health check endpoints on port 3001:

- `GET /health` - Simple health status (200 = healthy, 503 = unhealthy)
- `GET /status` - Detailed status with IP and location info

Example responses:

```json
// GET /health
{"status": "healthy"}

// GET /status
{
  "vpn_enabled": true,
  "external_ip": "185.213.154.123",
  "location": "New York, United States"
}
```

### Log Monitoring

Monitor container logs for VPN status:

```bash
# Follow container logs
docker logs -f container_name

# Key log patterns:
# - "VPN connection established successfully"
# - "✅ Successfully connected through Mullvad VPN"
# - "❌ NOT connected through Mullvad VPN"
# - "WARN: VPN setup failed, continuing without VPN"
```

## Troubleshooting

### Common Issues

1. **"Failed to download WireGuard configuration"**
   - Check your account token is valid
   - Verify account has active subscription
   - Try different relay location

2. **"WireGuard interface not found after setup"**
   - Ensure container runs with `--privileged` flag
   - Check `--cap-add=NET_ADMIN --cap-add=SYS_MODULE`
   - Verify WireGuard tools are installed

3. **"NOT connected through Mullvad VPN"**
   - Check if relay server is available
   - Try different relay location
   - Verify firewall/network policies

4. **"Cannot reach internet through VPN"**
   - DNS resolution issue - check `/etc/resolv.conf`
   - Routing table problems - check WireGuard config
   - Relay server connectivity issues

### Debug Mode

Enable verbose logging:

```bash
docker run --rm --privileged \
  -e MULLVAD_VPN_ENABLED="true" \
  -e MULLVAD_ACCOUNT_TOKEN="token" \
  -e DEBUG="true" \
  scraper-vpn
```

### Manual Verification

Check VPN status from inside container:

```bash
# Enter running container
docker exec -it container_name /bin/bash

# Check WireGuard status
wg show

# Check external IP
curl https://ipinfo.io/ip

# Check Mullvad connection
curl https://am.i.mullvad.net/json
```

## Security Considerations

1. **Account Token Protection**: Store in secure secrets, never in code
2. **Config Cleanup**: Enable `MULLVAD_CLEANUP_CONFIG=true` for production
3. **Privilege Requirements**: Only use `--privileged` when necessary
4. **Network Isolation**: Consider network policies for production deployments
5. **Log Scrubbing**: Avoid logging sensitive data in container logs

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  GitHub Actions │───▶│  Docker Container │───▶│  Mullvad VPN    │
│                 │    │                  │    │  Relay Server   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  Scraper Process │───▶│  Target Website │
                       │                  │    │  (Sherdog, etc) │
                       └──────────────────┘    └─────────────────┘
```

## Files Structure

```
docker/mullvad/
├── Dockerfile              # Main container definition
├── entrypoint.sh           # Container startup script
├── scripts/
│   ├── setup-vpn.sh        # VPN configuration setup
│   ├── verify-connection.sh # Connection verification
│   ├── monitor-connection.sh # Health monitoring
│   ├── disconnect-vpn.sh   # Clean disconnection
│   ├── health-check.sh     # Docker health check
│   └── health-server.sh    # HTTP health endpoints
└── README.md               # This file
```

## Contributing

When modifying VPN integration:

1. Test both VPN and non-VPN modes
2. Verify fallback mechanisms work
3. Check health endpoints respond correctly
4. Ensure clean shutdown procedures
5. Update documentation for new environment variables

## Support

For Mullvad-specific issues:
- [Mullvad Support](https://mullvad.net/en/help)
- [WireGuard Documentation](https://www.wireguard.com/)

For integration issues:
- Check container logs first
- Test with different relay locations
- Verify account status and configuration