# Docker Production Deployment Guide

## Quick Start

### 1. Using Docker Compose (Recommended)

```bash
# Start all services (app, postgres, redis) with restart policy
./docker-run.sh

# Or manually:
docker compose up -d
```

### 2. Using Docker Run Directly

```bash
# Build the image
docker build -t polysignal-app .

# Run with restart policy
docker run -d \
  --name polysignal_app \
  --restart always \
  -p 3001:3001 \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  polysignal-app
```

## Restart Policies

The containers are configured with `restart: always` which means:
- ✅ Container will automatically restart if it stops
- ✅ Container will automatically restart after Docker daemon restarts
- ✅ Container will automatically restart after system reboots

## Production Features

### Health Checks
- App health check: `/api/health` endpoint
- PostgreSQL health check: `pg_isready`
- Redis health check: `redis-cli ping`

### Persistent Data
- **PostgreSQL data**: Stored in `postgres_data` volume (persists across restarts)
- **Redis data**: Stored in `redis_data` volume with AOF persistence
- **App logs**: Stored in `./logs` directory (mounted volume)

### Process Management
- Uses PM2 with `pm2-runtime` for process management
- Automatic restarts on crashes
- Memory limits and restart policies configured

## Commands

```bash
# View logs
docker-compose logs -f app

# Restart app
docker-compose restart app

# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes data)
docker-compose down -v

# Rebuild and restart
docker-compose up -d --build

# Check container status
docker-compose ps

# Execute commands in container
docker-compose exec app sh
```

## Production Override

For additional production settings (resource limits, logging), use:

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Environment Variables

Ensure your `.env` file contains all required variables:
- Database credentials
- Redis URL
- JWT secrets
- Blockchain RPC URLs
- API keys
- etc.

## Monitoring

### Check if containers are running
```bash
docker-compose ps
```

### Check container health
```bash
docker inspect polysignal_app | grep Health -A 10
```

### View resource usage
```bash
docker stats polysignal_app
```

## Troubleshooting

### Container keeps restarting
```bash
# Check logs for errors
docker-compose logs app

# Check container status
docker inspect polysignal_app
```

### Database connection issues
```bash
# Check if postgres is healthy
docker-compose exec postgres pg_isready -U postgres

# Check postgres logs
docker-compose logs postgres
```

### Redis connection issues
```bash
# Check if redis is healthy
docker-compose exec redis redis-cli ping

# Check redis logs
docker-compose logs redis
```

## Backup

### Backup PostgreSQL
```bash
docker-compose exec postgres pg_dump -U postgres polysignal_db > backup.sql
```

### Backup Redis
```bash
docker-compose exec redis redis-cli SAVE
docker cp polysignal_redis:/data/dump.rdb ./backup.rdb
```

