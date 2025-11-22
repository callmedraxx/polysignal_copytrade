# PolySignal Copy Trading

Express.js server with TypeScript, PostgreSQL, Redis, AdminJS, and Swagger documentation.

## Features

- ✅ Express.js with TypeScript
- ✅ **Development mode**: `tsx` watcher, in-memory database & Redis (no Docker required)
- ✅ **Production mode**: Docker and PM2 with PostgreSQL and Redis
- ✅ Swagger/OpenAPI documentation
- ✅ AdminJS admin panel (production only)
- ✅ SIWE (Sign-In with Ethereum) authentication
- ✅ JWT token-based authentication
- ✅ Simple frontend for testing authentication

## Development Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Run in development mode (local machine, no PM2, no Docker):
   ```bash
   npm run dev
   ```

**Note**: In development mode (`NODE_ENV=development`), the app uses in-memory stores for both database and Redis. No Docker, PostgreSQL, or Redis setup is required. Database migrations are only needed for production.

The server will start on `http://localhost:3001` with hot-reload enabled.

## Production Setup with Docker

1. Ensure your `.env` file is configured with production values

2. Build and start all services:
```bash
docker-compose up -d
```

3. View logs:
```bash
docker-compose logs -f
```

4. Stop services:
```bash
docker-compose down
```

## Production Setup (Local with PM2)

1. Build the project:
```bash
npm run build
```

2. Start with PM2:
```bash
npm run start:prod
```

## Endpoints

- **Frontend**: `http://localhost:3001` (authentication test page)
- API: `http://localhost:3001/api`
- Health Check: `http://localhost:3001/api/health`
- Swagger Docs: `http://localhost:3001/api-docs`
- Admin Panel: `http://localhost:3001/admin` (production only)
- Auth Nonce: `POST http://localhost:3001/api/auth/nonce`
- Auth Verify: `POST http://localhost:3001/api/auth/verify`
- Auth Me: `GET http://localhost:3001/api/auth/me` (requires Bearer token)

## Authentication

This project uses SIWE (Sign-In with Ethereum) for wallet-based authentication with JWT tokens. See [AUTHENTICATION.md](./AUTHENTICATION.md) for detailed documentation on how to use the authentication system.

## Environment Variables

See `.env.example` for required environment variables.

## Project Structure

```
src/
├── config/          # Configuration files
├── routes/          # API routes
│   └── auth.ts      # Authentication routes
├── services/        # Business logic
│   └── auth.ts      # Authentication service
├── middleware/      # Express middleware
│   └── auth.ts      # JWT authentication middleware
├── admin/           # AdminJS setup
└── index.ts         # Main entry point
```

# polysignal_copytrade
