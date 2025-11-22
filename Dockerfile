# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json ./

# Install dependencies with pnpm
RUN pnpm install --frozen-lockfile

# Copy source code
COPY src ./src
COPY prisma ./prisma

# Generate Prisma client (required before TypeScript build)
RUN npx prisma generate

# Build TypeScript with npm (packages already installed by pnpm)
RUN npm run build

# Production stage
FROM node:20-alpine

# Install OpenSSL and other required libraries for Prisma
RUN apk add --no-cache openssl libc6-compat

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies with pnpm, then install PM2 globally with npm
RUN pnpm install --frozen-lockfile --prod && npm install -g pm2

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY ecosystem.config.js ./
RUN mkdir -p logs logs/users

# Generate Prisma client in production stage (needed at runtime)
RUN npx prisma generate

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start with PM2 (pm2-runtime keeps container alive and handles restarts)
CMD ["pm2-runtime", "start", "ecosystem.config.js"]

