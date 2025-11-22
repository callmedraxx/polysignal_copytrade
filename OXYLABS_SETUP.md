# Proxy Setup for CLOB Order Submission

This document explains how to configure proxy for order submission to bypass Cloudflare IP blocking.

## Quick Setup: Use Local Machine IP

To route CLOB orders through your local machine IP instead of the server IP:

```bash
# Set CLOB-specific proxy URL (routes through your local machine)
# Format: http://YOUR_LOCAL_IP:PORT or http://username:password@YOUR_LOCAL_IP:PORT
CLOB_PROXY_URL=http://YOUR_LOCAL_IP:PORT

# Example with SSH tunnel (see below for setup):
CLOB_PROXY_URL=http://127.0.0.1:8080
```

**Note:** The Oxylabs configuration below is kept for future use but won't be used for CLOB orders if `CLOB_PROXY_URL` is set.

## Oxylabs Proxy Setup (For Future Use)

The Oxylabs configuration is preserved but currently not used for CLOB orders if `CLOB_PROXY_URL` is set.

### Environment Variables

Add these to your `.env` file:

```bash
# Enable proxy for order submission
PROXY_ENABLED=true

# Option 1: Direct proxy URL (recommended - use this format)
PROXY_URL=http://user-draxx_JlBYn-country-US:Jwjj90__==Jwjj90__==@dc.oxylabs.io:8000

# Option 2: Use Oxylabs-specific variables (auto-formatted)
OXYLABS_USERNAME=user-draxx_JlBYn-country-US
OXYLABS_PASSWORD=Jwjj90__==Jwjj90__==
OXYLABS_PROXY_TYPE=http  # or 'socks5'
OXYLABS_USE_DATACENTER=true  # Use dc.oxylabs.io (datacenter) instead of pr.oxylabs.io (residential)
OXYLABS_COUNTRY=US  # Optional: if not included in username
```

## Getting Oxylabs Credentials

1. Sign up at https://oxylabs.io
2. Get free trial credits
3. Go to Dashboard → Proxies
4. Choose proxy type:
   - **Datacenter Proxies** (dc.oxylabs.io): Faster, cheaper, port 8000
   - **Residential Proxies** (pr.oxylabs.io): More anonymous, port 7777
5. Copy your credentials:
   - **Datacenter**: Username format `user-USERNAME-country-XX` (e.g., `user-draxx_JlBYn-country-US`)
   - **Residential**: Username format `customer-USERNAME` (e.g., `customer-xxxxx`)
   - Password: Your account password

## Proxy URL Format

### Datacenter Proxy (dc.oxylabs.io) - Faster, cheaper
```
http://user-USERNAME-country-US:PASSWORD@dc.oxylabs.io:8000
```

Example with your credentials:
```
http://user-draxx_JlBYn-country-US:Jwjj90__==Jwjj90__==@dc.oxylabs.io:8000
```

### Residential Proxy (pr.oxylabs.io) - More anonymous
```
http://customer-USERNAME:PASSWORD@pr.oxylabs.io:7777
```

### SOCKS5 Proxy
```
socks5://customer-USERNAME:PASSWORD@pr.oxylabs.io:1080
```

### With Country Targeting (Residential)
```
http://customer-USERNAME:PASSWORD@pr.oxylabs.io:7777/country-us
```

## Setting Up Local Machine Proxy

### Option 1: SSH Reverse Tunnel (Recommended for Docker)

**Important**: For Docker containers to access the proxy, the SSH tunnel must bind to all interfaces (0.0.0.0), not just localhost.

1. **On your local machine**, create a reverse SSH tunnel that binds to all interfaces:
   ```bash
   ssh -R 0.0.0.0:8080:localhost:8080 -N user@your-server-ip
   ```
   This creates a tunnel where:
   - Server's port 8080 (accessible from Docker) forwards to your local machine's port 8080
   - The `0.0.0.0` binding allows Docker containers to access it via `host.docker.internal`

2. **On the server**, configure in `.env`:
   ```bash
   CLOB_PROXY_URL=http://host.docker.internal:8080
   ```
   
   **Note**: If using SOCKS5, use:
   ```bash
   CLOB_PROXY_URL=socks5://host.docker.internal:8080
   ```

### Option 2: Local HTTP Proxy Server

1. **On your local machine**, set up a proxy server (e.g., using Squid, or a simple Node.js proxy)

2. **On the server**, configure in `.env`:
   ```bash
   CLOB_PROXY_URL=http://YOUR_LOCAL_IP:PORT
   ```

### Option 3: Disable Proxy (Use Server IP)

If you want to use the server's IP directly (no proxy):
```bash
# Don't set CLOB_PROXY_URL, and set:
PROXY_ENABLED=false
```

## How It Works

- **If `CLOB_PROXY_URL` is set**: CLOB orders use this proxy (your local machine)
- **If `CLOB_PROXY_URL` is not set**: CLOB orders use the general proxy (Oxylabs if configured)
- **Oxylabs config is preserved**: All Oxylabs environment variables remain intact for future use

## Usage

The proxy is **only used for order submission** (`submitOrder` function), not for:
- Fetching market data
- Getting order books
- Reading order status
- Other read-only operations

This ensures:
- ✅ Order submissions bypass Cloudflare IP blocking
- ✅ Read operations remain fast (no proxy overhead)
- ✅ Lower proxy usage costs

## Testing

To test if proxy is working:

1. Enable proxy in `.env`:
   ```bash
   PROXY_ENABLED=true
   PROXY_URL=http://user-draxx_JlBYn-country-US:Jwjj90__==Jwjj90__==@dc.oxylabs.io:8000
   ```
   
   Or use auto-format:
   ```bash
   PROXY_ENABLED=true
   OXYLABS_USERNAME=user-draxx_JlBYn-country-US
   OXYLABS_PASSWORD=Jwjj90__==Jwjj90__==
   OXYLABS_USE_DATACENTER=true
   ```

2. Submit a test order and check logs:
   ```
   Using proxy for order submission { proxyEnabled: true }
   ```

3. Verify the order goes through (should not get 403 Forbidden)

## Troubleshooting

### Proxy not working
- Check credentials are correct
- Verify `PROXY_ENABLED=true`
- Check proxy URL format
- Test proxy URL manually: 
  ```bash
  curl -x dc.oxylabs.io:8000 -U "user-draxx_JlBYn-country-US:Jwjj90__==Jwjj90__==" https://ip.oxylabs.io/location
  ```

### Still getting 403 errors
- Try different country: `OXYLABS_COUNTRY=us`
- Try SOCKS5 instead of HTTP: `OXYLABS_PROXY_TYPE=socks5`
- Check Oxylabs dashboard for IP rotation settings

### Proxy too slow
- Proxy is only used for order submission, not reads
- Consider using datacenter proxies instead of residential (faster but may be detected)

## Cost Optimization

Since proxy is only used for order submission:
- Typical usage: ~1-10 requests per order
- Free trial usually includes enough credits for testing
- Monitor usage in Oxylabs dashboard

