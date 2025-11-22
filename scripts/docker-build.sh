#!/bin/bash

# Docker build script: Uses pnpm for installation, npm for building

set -e

echo "📦 Installing dependencies with pnpm..."
pnpm install --frozen-lockfile

echo "🔨 Building with npm..."
npm run build

echo "✅ Build complete!"

