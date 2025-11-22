#!/bin/bash
# Test proxy connection using curl
# This can be run inside the Docker container

echo "🔍 Testing Proxy Connection with curl..."
echo ""

# Get proxy URL from environment
PROXY_URL="${CLOB_PROXY_URL:-${HTTP_PROXY:-${HTTPS_PROXY}}}"

if [ -z "$PROXY_URL" ]; then
    echo "❌ CLOB_PROXY_URL, HTTP_PROXY, or HTTPS_PROXY is not set!"
    exit 1
fi

echo "Proxy URL: $PROXY_URL"
echo "Target: https://clob.polymarket.com"
echo ""

# Extract proxy host, port, and credentials
# Format: http://user:pass@host:port or socks5://user:pass@host:port
if [[ $PROXY_URL == *"@"* ]]; then
    # Has credentials
    PROXY_CREDS=$(echo $PROXY_URL | sed -E 's|^[^/]+//([^@]+)@.*|\1|')
    PROXY_HOST_PORT=$(echo $PROXY_URL | sed -E 's|^[^/]+//[^@]+@(.+)$|\1|')
else
    # No credentials
    PROXY_HOST_PORT=$(echo $PROXY_URL | sed -E 's|^[^/]+//(.+)$|\1|')
fi

PROXY_HOST=$(echo $PROXY_HOST_PORT | cut -d: -f1)
PROXY_PORT=$(echo $PROXY_HOST_PORT | cut -d: -f2)

echo "Proxy Host: $PROXY_HOST"
echo "Proxy Port: $PROXY_PORT"
echo ""

# Test 1: Check IP through proxy
echo "1. Testing IP check through proxy..."
if [[ $PROXY_URL == socks5* ]] || [[ $PROXY_URL == socks5h* ]]; then
    curl -x "socks5h://$PROXY_HOST:$PROXY_PORT" --proxy-user "$PROXY_CREDS" \
         --max-redirs 100 --insecure \
         -s "https://api.ipify.org?format=json" | jq -r '.ip' || echo "Failed"
else
    curl -x "$PROXY_URL" \
         --max-redirs 100 --insecure \
         -s "https://api.ipify.org?format=json" | jq -r '.ip' || echo "Failed"
fi
echo ""

# Test 2: Test CLOB API health endpoint
echo "2. Testing CLOB API /health endpoint through proxy..."
if [[ $PROXY_URL == socks5* ]] || [[ $PROXY_URL == socks5h* ]]; then
    curl -x "socks5h://$PROXY_HOST:$PROXY_PORT" --proxy-user "$PROXY_CREDS" \
         --max-redirs 100 --insecure \
         -v "https://clob.polymarket.com/health" 2>&1 | head -50
else
    curl -x "$PROXY_URL" \
         --max-redirs 100 --insecure \
         -v "https://clob.polymarket.com/health" 2>&1 | head -50
fi
echo ""

# Test 3: Test with verbose output to see redirects
echo "3. Testing with verbose output (showing redirects)..."
if [[ $PROXY_URL == socks5* ]] || [[ $PROXY_URL == socks5h* ]]; then
    curl -x "socks5h://$PROXY_HOST:$PROXY_PORT" --proxy-user "$PROXY_CREDS" \
         --max-redirs 100 --insecure \
         -v --location "https://clob.polymarket.com/health" 2>&1 | grep -E "(Location|HTTP|redirect|max-redirs)" || echo "No redirects detected"
else
    curl -x "$PROXY_URL" \
         --max-redirs 100 --insecure \
         -v --location "https://clob.polymarket.com/health" 2>&1 | grep -E "(Location|HTTP|redirect|max-redirs)" || echo "No redirects detected"
fi
echo ""

echo "✅ curl testing completed!"

