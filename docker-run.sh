#!/bin/bash

# Production Docker Run Script for PolySignal Copy Trading
# This script ensures the container runs and persists on restarts

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting PolySignal Copy Trading in Production Mode${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  Warning: .env file not found. Creating from .env.example if it exists...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  Please update .env with your production values!${NC}"
    else
        echo -e "${RED}❌ Error: .env file is required. Please create one with your configuration.${NC}"
        exit 1
    fi
fi

# Create necessary directories
mkdir -p logs
mkdir -p data

# Stop and remove existing containers if they exist
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker compose down 2>/dev/null || true

# Build and start services
echo -e "${GREEN}🔨 Building Docker images...${NC}"
docker compose build --no-cache

echo -e "${GREEN}🚀 Starting services with restart policy...${NC}"
docker compose up -d

# Wait for services to be healthy
echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
sleep 10

# Check container status
echo -e "${GREEN}📊 Container Status:${NC}"
docker compose ps

# Show logs
echo -e "${GREEN}📋 Recent logs:${NC}"
docker compose logs --tail=50 app

echo -e "${GREEN}✅ Services started successfully!${NC}"
echo -e "${GREEN}📝 To view logs: docker-compose logs -f app${NC}"
echo -e "${GREEN}🛑 To stop: docker-compose down${NC}"
echo -e "${GREEN}🔄 To restart: docker-compose restart app${NC}"

