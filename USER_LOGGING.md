# User Activity Logging System

## Overview

The application now includes a comprehensive per-user logging system that tracks all user activities in individual log files. Each user has their own log file that contains their complete activity history from signup to all operations.

## Log File Location

User logs are stored in: `logs/users/{user_address}.log`

The filename is based on the user's wallet address (lowercase, sanitized for filesystem compatibility).

## What Gets Logged

### 1. Authentication Events
- **Signup**: When a new user signs up
- **Login**: Every time a user logs in
- **IP Address**: Captured and logged with each authentication event

### 2. Safe Wallet Deployment
- **Deployment Start**: When Safe wallet deployment is initiated
- **Deployment Success**: Safe address and transaction hash
- **Deployment Errors**: Full error details including stack traces

### 3. Trade Operations
- **Trade Copied**: When a trade is detected and copied from a trader
  - Original transaction hash
  - Market ID and question
  - Trade type (buy/sell)
  - Original amount and price
- **Trade Execution Start**: When trade execution begins
- **Trade Execution Success**: Order ID, transaction hash, amounts
- **Trade Execution Errors**: Retry attempts, error messages, failure reasons

### 4. Deposit Operations
- **Deposit Initiated**: When user starts a deposit
  - Source currency and amount
  - Deposit ID
- **Deposit Status Updates**: Processing, bridging, completed
- **Deposit Completion**: Transaction hash, final amount
- **Deposit Errors**: Error messages and failure details

### 5. Configuration Operations
- **Config Created**: Copy trading or signal config creation
  - Trader address
  - Amount settings
  - Trade type preferences
- **Config Updated**: Changes to existing configurations

### 6. API Requests
- **All Authenticated Requests**: Method, endpoint, query params
- **API Errors**: Error details with request context
- **IP Address**: Logged with each request

## Log Format

Each log entry follows this format:

```
TIMESTAMP | LEVEL | CATEGORY | MESSAGE [IP: x.x.x.x] [UserID: xxx] [Address: 0x...]
  Data: { ... }
```

### Log Levels
- **INFO**: General information
- **SUCCESS**: Successful operations
- **WARN**: Warnings (retries, non-critical issues)
- **ERROR**: Errors with full stack traces

### Categories
- `AUTH`: Authentication events
- `SAFE_DEPLOYMENT`: Safe wallet operations
- `TRADE_COPY`: Trade copying events
- `TRADE_EXECUTION`: Trade execution operations
- `DEPOSIT`: Deposit operations
- `CONFIG`: Configuration changes
- `API_REQUEST`: API requests
- `API_ERROR`: API errors
- `CLOB_CLIENT`: CLOB client operations

## Usage Examples

### Finding a User's Log File

```bash
# Find log file by user address
ls logs/users/0x1234567890abcdef1234567890abcdef12345678.log

# Or search for a user
grep -r "0x1234" logs/users/
```

### Viewing User Activity

```bash
# View entire log file
cat logs/users/0x1234...log

# View recent activity (last 50 lines)
tail -50 logs/users/0x1234...log

# Search for specific events
grep "TRADE_EXECUTION" logs/users/0x1234...log
grep "ERROR" logs/users/0x1234...log
grep "DEPOSIT" logs/users/0x1234...log
```

### Troubleshooting User Issues

```bash
# Find all errors for a user
grep "ERROR" logs/users/0x1234...log

# Find deposit issues
grep -A 5 "DEPOSIT.*ERROR" logs/users/0x1234...log

# Find trade execution failures
grep -A 10 "TRADE_EXECUTION.*ERROR" logs/users/0x1234...log

# Timeline of user activity
grep -E "AUTH|SAFE_DEPLOYMENT|TRADE|DEPOSIT" logs/users/0x1234...log | head -20
```

## Integration Points

The logging system is integrated throughout the application:

1. **Authentication** (`src/services/auth.ts`)
   - Logs signup and login events
   - Captures IP addresses

2. **Wallet Service** (`src/services/wallet.ts`)
   - Logs Safe deployment attempts
   - Logs deployment success/failure

3. **Trade Executor** (`src/services/trade-executor.ts`)
   - Logs trade execution lifecycle
   - Logs retry attempts and errors

4. **Trade Monitor** (`src/services/trade-monitor.ts`)
   - Logs when trades are copied

5. **Deposit Service** (`src/services/deposit.ts`)
   - Logs deposit initiation
   - Logs deposit errors

6. **Deposit Tracker** (`src/services/deposit-tracker.ts`)
   - Logs deposit status updates
   - Logs deposit completion

7. **Config Service** (`src/services/copytrading.ts`)
   - Logs config creation and updates

8. **Route Handlers** (`src/routes/*.ts`)
   - Logs API requests and errors via middleware

## Docker Persistence

User logs are persisted in Docker via volume mount:
- Local: `./logs/users` → Container: `/app/logs/users`
- Also stored in Docker volume: `user_logs`

This ensures logs persist across container restarts and rebuilds.

## Log Rotation

Currently, logs are appended to files indefinitely. For production, consider:
- Implementing log rotation (daily/weekly)
- Archiving old logs
- Setting maximum file sizes

## Security Considerations

- **Sensitive Data**: Passwords, private keys, and signatures are automatically redacted in API request logs
- **IP Addresses**: Stored for security and troubleshooting purposes
- **File Permissions**: Ensure log files have appropriate permissions (read-only for non-owners)

## Example Log Entry

```
2024-01-15T10:30:45.123Z | SUCCESS | AUTH | User logged in [IP: 192.168.1.100] [UserID: abc-123] [Address: 0x1234...]
  Data: {
    "userId": "abc-123",
    "address": "0x1234...",
    "proxyWallet": "0x5678..."
  }

2024-01-15T10:31:12.456Z | INFO | TRADE_COPY | Trade copied from trader [IP: 192.168.1.100] [Address: 0x1234...]
  Data: {
    "tradeId": "trade-123",
    "originalTxHash": "0xabc...",
    "marketId": "0xdef...",
    "configId": "config-456",
    "traderAddress": "0x789...",
    "tradeType": "buy",
    "originalAmount": "100.0"
  }

2024-01-15T10:31:15.789Z | SUCCESS | TRADE_EXECUTION | Trade executed successfully [IP: 192.168.1.100] [Address: 0x1234...]
  Data: {
    "tradeId": "trade-123",
    "orderId": "order-789",
    "transactionHash": "0xtx...",
    "marketId": "0xdef...",
    "tradeType": "buy",
    "copiedAmount": "50.0"
  }
```

## Benefits

1. **Complete Audit Trail**: Every user action is logged with timestamps
2. **Easy Troubleshooting**: Quickly identify when and why issues occurred
3. **IP Tracking**: Helps identify suspicious activity or location-based issues
4. **Error Analysis**: Full error context including stack traces
5. **User Support**: Quickly trace user complaints to specific events
6. **Compliance**: Maintain records of all user activities

