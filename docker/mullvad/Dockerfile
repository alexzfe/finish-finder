# Mullvad VPN-enabled scraper container
FROM node:20-alpine

# Install required packages for VPN functionality
RUN apk add --no-cache \
    curl \
    jq \
    iptables \
    openssl \
    ca-certificates \
    wireguard-tools \
    bash

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy Prisma schema first (required for postinstall)
COPY prisma/ ./prisma/

# Install dependencies (including dev deps for ts-node)
RUN npm ci

# Configure ts-node for ES modules
ENV TS_NODE_ESM=true

# Copy application code
COPY . .

# Copy Mullvad VPN scripts
COPY docker/mullvad/scripts/ /opt/mullvad/

# Make scripts executable
RUN chmod +x /opt/mullvad/*.sh

# Create VPN configuration directory
RUN mkdir -p /etc/wireguard

# Set up entrypoint
COPY docker/mullvad/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose health check port
EXPOSE 3001

# Health check to verify VPN connection
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD /opt/mullvad/health-check.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "scripts/automated-scraper.js", "check"]