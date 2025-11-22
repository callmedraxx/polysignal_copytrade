#!/bin/bash
# Simple proxy bridge to make SSH tunnel accessible from Docker
# This runs on the host and forwards Docker requests to the SSH tunnel

PROXY_PORT=8081
TUNNEL_PORT=8080

echo "Setting up proxy bridge on port $PROXY_PORT -> localhost:$TUNNEL_PORT"
echo "Docker containers should use: http://host.docker.internal:$PROXY_PORT"

# Check if socat is available
if command -v socat &> /dev/null; then
    echo "Using socat to create proxy bridge..."
    socat TCP-LISTEN:$PROXY_PORT,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:$TUNNEL_PORT &
    echo "Proxy bridge started. PID: $!"
    echo "To stop: kill $!"
else
    echo "socat not found. Installing..."
    # Try to install socat
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y socat
    elif command -v yum &> /dev/null; then
        sudo yum install -y socat
    else
        echo "Cannot install socat automatically. Please install it manually."
        exit 1
    fi
    socat TCP-LISTEN:$PROXY_PORT,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:$TUNNEL_PORT &
    echo "Proxy bridge started. PID: $!"
fi

