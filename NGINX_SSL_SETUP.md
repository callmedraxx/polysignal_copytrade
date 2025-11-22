# Nginx SSL Setup for poly.dev.api.polysignal.io

## Overview
The application is now proxied through nginx with SSL certificates from Let's Encrypt.

## Configuration Files
- **Nginx Config**: `/etc/nginx/sites-available/polysignal.conf`
- **Source Config**: `/root/polysignal_copytrade/nginx/polysignal.conf`
- **SSL Certificates**: `/etc/letsencrypt/live/poly.dev.api.polysignal.io/`

## SSL Certificate Details
- **Domain**: poly.dev.api.polysignal.io
- **Certificate**: `/etc/letsencrypt/live/poly.dev.api.polysignal.io/fullchain.pem`
- **Private Key**: `/etc/letsencrypt/live/poly.dev.api.polysignal.io/privkey.pem`
- **Expires**: 2026-02-19
- **Auto-renewal**: Configured via certbot timer

## Endpoints
- **HTTPS**: https://poly.dev.api.polysignal.io
- **API Health**: https://poly.dev.api.polysignal.io/api/health
- **Admin Panel**: https://poly.dev.api.polysignal.io/admin
- **API Docs**: https://poly.dev.api.polysignal.io/api-docs

## Features
- ✅ HTTP to HTTPS redirect
- ✅ SSL/TLS encryption (TLSv1.2, TLSv1.3)
- ✅ HTTP/2 enabled
- ✅ Security headers (HSTS, X-Frame-Options, etc.)
- ✅ Automatic certificate renewal
- ✅ Reverse proxy to app on port 3001

## Certificate Renewal
Certificates are automatically renewed by certbot. To manually renew:
```bash
certbot renew
systemctl reload nginx
```

## Nginx Management
```bash
# Test configuration
nginx -t

# Reload nginx
systemctl reload nginx

# Restart nginx
systemctl restart nginx

# Check status
systemctl status nginx
```

## Troubleshooting
- Check nginx logs: `/var/log/nginx/error.log`
- Check certbot logs: `/var/log/letsencrypt/letsencrypt.log`
- Verify DNS: `dig poly.dev.api.polysignal.io`
- Test SSL: `openssl s_client -connect poly.dev.api.polysignal.io:443`

