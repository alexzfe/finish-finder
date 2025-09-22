#!/bin/bash

# Simple health check HTTP server for external monitoring
# Runs on port 3001 and provides health status endpoints

log() {
    echo "[$(date -Iseconds)] health-server: $1"
}

log "Starting health check HTTP server on port 3001..."

# Create named pipe for HTTP responses
RESPONSE_PIPE="/tmp/http_response"
mkfifo "$RESPONSE_PIPE"

# Function to handle HTTP requests
handle_request() {
    while IFS= read -r line; do
        # Read the request line
        if [[ $line =~ ^GET\ (/[^\ ]*)\ HTTP ]]; then
            path="${BASH_REMATCH[1]}"

            case "$path" in
                "/health")
                    # Run health check and return status
                    if /opt/mullvad/health-check.sh >/dev/null 2>&1; then
                        echo -e "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 25\r\n\r\n{\"status\": \"healthy\"}" > "$RESPONSE_PIPE"
                    else
                        echo -e "HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\nContent-Length: 27\r\n\r\n{\"status\": \"unhealthy\"}" > "$RESPONSE_PIPE"
                    fi
                    ;;
                "/status")
                    # Return detailed status information
                    if [ "${MULLVAD_VPN_ENABLED:-true}" = "true" ]; then
                        if [ -f /tmp/mullvad_ip ] && [ -f /tmp/mullvad_location ]; then
                            ip=$(cat /tmp/mullvad_ip)
                            location=$(cat /tmp/mullvad_location)
                            status_json="{\"vpn_enabled\": true, \"external_ip\": \"$ip\", \"location\": \"$location\"}"
                        else
                            status_json="{\"vpn_enabled\": true, \"external_ip\": \"unknown\", \"location\": \"unknown\"}"
                        fi
                    else
                        status_json="{\"vpn_enabled\": false}"
                    fi

                    content_length=${#status_json}
                    echo -e "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: $content_length\r\n\r\n$status_json" > "$RESPONSE_PIPE"
                    ;;
                *)
                    # 404 for unknown paths
                    echo -e "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: 9\r\n\r\nNot Found" > "$RESPONSE_PIPE"
                    ;;
            esac
            break
        fi
    done
}

# Start the HTTP server using netcat
while true; do
    nc -l -p 3001 -e /bin/sh -c 'handle_request < /dev/stdin; cat /tmp/http_response' 2>/dev/null || {
        log "WARN: netcat failed, retrying in 5 seconds..."
        sleep 5
    }
done &

log "Health check HTTP server started (PID: $!)"