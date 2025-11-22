# Trade History User Endpoint Documentation

## Endpoint

**`GET /api/trade-history/user`**

This endpoint retrieves trade history for the authenticated user across all their copy trading configurations. It supports pagination, filtering by status, trade type, and specific configuration ID. Trades are returned in descending order by creation date (most recent first).

---

## Authentication

**Required:** Yes - JWT Bearer Token

The endpoint requires JWT authentication. The token must be included in the `Authorization` header as a Bearer token.

**Authentication Header:**
```
Authorization: Bearer <JWT_TOKEN>
```

The JWT token should contain:
- `userId`: User ID from the database
- `address`: User's wallet address

**Note:** If authentication fails or the token is missing, the endpoint returns a `401 Unauthorized` response.

---

## Request

### URL
```
GET /api/trade-history/user
```

### Headers
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Query Parameters

All query parameters are optional:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Number of trades to return (max recommended: 100) |
| `offset` | integer | 0 | Number of trades to skip (for pagination) |
| `status` | string | - | Filter by trade status. Valid values: `pending`, `executed`, `settled`, `failed`, `skipped` |
| `tradeType` | string | - | Filter by trade type. Valid values: `buy`, `sell` |
| `configId` | string | - | Filter by specific copy trading configuration ID |

### Request Body
None - This is a GET request with no body parameters.

### Example Requests

#### Basic Request (Get first 50 trades)
```bash
curl -X GET 'https://poly.dev.api.polysignal.io/api/trade-history/user' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json'
```

#### With Pagination
```bash
curl -X GET 'https://poly.dev.api.polysignal.io/api/trade-history/user?limit=25&offset=50' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json'
```

#### Filter by Status
```bash
curl -X GET 'https://poly.dev.api.polysignal.io/api/trade-history/user?status=settled' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json'
```

#### Filter by Trade Type
```bash
curl -X GET 'https://poly.dev.api.polysignal.io/api/trade-history/user?tradeType=buy' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json'
```

#### Filter by Configuration ID
```bash
curl -X GET 'https://poly.dev.api.polysignal.io/api/trade-history/user?configId=550e8400-e29b-41d4-a716-446655440000' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json'
```

#### Combined Filters
```bash
curl -X GET 'https://poly.dev.api.polysignal.io/api/trade-history/user?status=settled&tradeType=buy&limit=20&offset=0' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json'
```

### Frontend Example (JavaScript/TypeScript)

```typescript
interface TradeHistoryOptions {
  limit?: number;
  offset?: number;
  status?: 'pending' | 'executed' | 'settled' | 'failed' | 'skipped';
  tradeType?: 'buy' | 'sell';
  configId?: string;
}

async function getTradeHistory(
  token: string,
  options: TradeHistoryOptions = {}
) {
  const params = new URLSearchParams();
  
  if (options.limit !== undefined) {
    params.append('limit', options.limit.toString());
  }
  if (options.offset !== undefined) {
    params.append('offset', options.offset.toString());
  }
  if (options.status) {
    params.append('status', options.status);
  }
  if (options.tradeType) {
    params.append('tradeType', options.tradeType);
  }
  if (options.configId) {
    params.append('configId', options.configId);
  }

  const url = `https://poly.dev.api.polysignal.io/api/trade-history/user${params.toString() ? '?' + params.toString() : ''}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get trade history');
  }
  
  return await response.json();
}

// Usage examples
try {
  // Get first 50 trades
  const history = await getTradeHistory(userToken);
  console.log('Trade history:', history);

  // Get settled buy trades
  const settledBuys = await getTradeHistory(userToken, {
    status: 'settled',
    tradeType: 'buy',
    limit: 25,
  });

  // Get trades for specific config
  const configTrades = await getTradeHistory(userToken, {
    configId: '550e8400-e29b-41d4-a716-446655440000',
  });
} catch (error) {
  console.error('Error fetching trade history:', error);
}
```

### React Hook Example

```typescript
import { useState, useEffect } from 'react';

interface TradeHistoryOptions {
  limit?: number;
  offset?: number;
  status?: 'pending' | 'executed' | 'settled' | 'failed' | 'skipped';
  tradeType?: 'buy' | 'sell';
  configId?: string;
}

interface TradeHistoryResponse {
  trades: CopiedTrade[];
  total: number;
  limit: number;
  offset: number;
}

function useTradeHistory(token: string, options: TradeHistoryOptions = {}) {
  const [data, setData] = useState<TradeHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        
        if (options.limit !== undefined) {
          params.append('limit', options.limit.toString());
        }
        if (options.offset !== undefined) {
          params.append('offset', options.offset.toString());
        }
        if (options.status) {
          params.append('status', options.status);
        }
        if (options.tradeType) {
          params.append('tradeType', options.tradeType);
        }
        if (options.configId) {
          params.append('configId', options.configId);
        }

        const url = `https://poly.dev.api.polysignal.io/api/trade-history/user${params.toString() ? '?' + params.toString() : ''}`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Authentication failed. Please log in again.');
          }
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch trade history');
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchHistory();
    }
  }, [token, options.limit, options.offset, options.status, options.tradeType, options.configId]);

  return { data, loading, error };
}
```

---

## Response

### Success Response (200 OK)

The endpoint returns an object containing an array of trades and pagination metadata.

```json
{
  "trades": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "configId": "550e8400-e29b-41d4-a716-446655440000",
      "originalTrader": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "originalTxHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
      "marketId": "0xabcdef1234567890abcdef1234567890abcdef12",
      "marketQuestion": "Will it rain tomorrow?",
      "outcomeIndex": 1,
      "tradeType": "buy",
      "originalAmount": "100.00",
      "originalPrice": "0.65",
      "originalShares": "153.85",
      "orderId": "0x9876543210fedcba9876543210fedcba98765432",
      "orderStatus": "SETTLED",
      "copiedTxHash": "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
      "copiedAmount": "50.00",
      "copiedPrice": "0.65",
      "copiedShares": "76.92",
      "status": "settled",
      "errorMessage": null,
      "submittedAt": "2024-01-15T10:30:00.000Z",
      "settledAt": "2024-01-15T10:31:15.000Z",
      "outcome": "pending",
      "pnl": null,
      "resolvedAt": null,
      "resolutionPrice": null,
      "currentPrice": "0.72",
      "currentValue": "55.38",
      "unrealizedPnl": "5.38",
      "costBasis": "50.00",
      "lastPriceUpdate": "2024-01-16T14:20:00.000Z",
      "failureReason": null,
      "failureCategory": null,
      "redemptionStatus": null,
      "redemptionTxHash": null,
      "redeemedAt": null,
      "redemptionError": null,
      "executedAt": "2024-01-15T10:31:15.000Z",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "config": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "targetTraderAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        "traderInfo": {
          "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
          "isValid": true,
          "totalTrades": 150,
          "totalVolume": "50000.5",
          "activePositions": 12,
          "buyTrades": 80,
          "sellTrades": 70,
          "userInfo": {
            "name": "John Doe",
            "pseudonym": "johndoe",
            "bio": "Professional trader",
            "profileImage": "https://polymarket.com/profile-image.jpg"
          }
        }
      }
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440002",
      "configId": "550e8400-e29b-41d4-a716-446655440000",
      "originalTrader": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "originalTxHash": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef",
      "marketId": "0x1234567890abcdef1234567890abcdef12345678",
      "marketQuestion": "Election outcome prediction",
      "outcomeIndex": 0,
      "tradeType": "sell",
      "originalAmount": "200.00",
      "originalPrice": "0.45",
      "originalShares": "444.44",
      "orderId": "0x1111111111111111111111111111111111111111",
      "orderStatus": "SETTLED",
      "copiedTxHash": "0x2222222222222222222222222222222222222222222222222222222222222222",
      "copiedAmount": "100.00",
      "copiedPrice": "0.45",
      "copiedShares": "222.22",
      "status": "settled",
      "errorMessage": null,
      "submittedAt": "2024-01-14T15:20:00.000Z",
      "settledAt": "2024-01-14T15:21:30.000Z",
      "outcome": "win",
      "pnl": "55.00",
      "resolvedAt": "2024-01-20T12:00:00.000Z",
      "resolutionPrice": "1.00",
      "currentPrice": null,
      "currentValue": null,
      "unrealizedPnl": null,
      "costBasis": null,
      "lastPriceUpdate": null,
      "failureReason": null,
      "failureCategory": null,
      "redemptionStatus": "redeemed",
      "redemptionTxHash": "0x3333333333333333333333333333333333333333333333333333333333333333",
      "redeemedAt": "2024-01-20T12:05:00.000Z",
      "redemptionError": null,
      "executedAt": "2024-01-14T15:21:30.000Z",
      "createdAt": "2024-01-14T15:20:00.000Z",
      "config": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "targetTraderAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        "traderInfo": {
          "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
          "isValid": true,
          "totalTrades": 150,
          "totalVolume": "50000.5"
        }
      }
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

### Response Fields

#### Response Object

| Field | Type | Description |
|-------|------|-------------|
| `trades` | CopiedTrade[] | Array of trade objects (see Trade Object structure below) |
| `total` | number | Total number of trades matching the filters (before pagination) |
| `limit` | number | Number of trades requested (same as query parameter or default) |
| `offset` | number | Number of trades skipped (same as query parameter or default) |

#### Trade Object (CopiedTrade)

Each trade object contains the following fields:

##### Trade Identification

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique trade identifier (UUID) |
| `configId` | string | ID of the copy trading configuration that generated this trade |
| `createdAt` | Date (ISO string) | Timestamp when the trade was created |
| `executedAt` | Date (ISO string) \| null | Timestamp when the trade was executed |

##### Original Trade Information

| Field | Type | Description |
|-------|------|-------------|
| `originalTrader` | string | Ethereum address of the trader being copied |
| `originalTxHash` | string | Transaction hash of the original trade on Polymarket |
| `marketId` | string | Polymarket market/condition ID |
| `marketQuestion` | string \| null | Market question/title (if available) |
| `outcomeIndex` | number | Outcome index (0 = NO, 1 = YES) |
| `tradeType` | string | Type of trade: `"buy"` or `"sell"` |
| `originalAmount` | string | Original trade amount in USDC |
| `originalPrice` | string \| null | Price at which the original trade was executed |
| `originalShares` | string \| null | Number of shares in the original trade |

##### Copied Trade Execution Details

| Field | Type | Description |
|-------|------|-------------|
| `orderId` | string \| null | CLOB order ID (unique identifier for the order) |
| `orderStatus` | string \| null | Order status: `PENDING`, `OPEN`, `FILLED`, `SETTLED`, `CANCELLED` |
| `copiedTxHash` | string \| null | Settlement transaction hash (available after order is SETTLED) |
| `copiedAmount` | string | Amount copied in USDC |
| `copiedPrice` | string \| null | Price at which the copied trade was executed |
| `copiedShares` | string \| null | Number of shares bought/sold in the copied trade |
| `status` | string | Trade status: `pending`, `executed`, `settled`, `failed`, `skipped` |
| `errorMessage` | string \| null | Error message if the trade failed |
| `submittedAt` | Date (ISO string) \| null | Timestamp when order was submitted to CLOB |
| `settledAt` | Date (ISO string) \| null | Timestamp when order was settled on-chain |

**Status Values:**
- `pending`: Trade is queued but not yet submitted
- `executed`: Trade has been submitted to CLOB but not yet settled
- `settled`: Trade has been settled on-chain
- `failed`: Trade failed to execute
- `skipped`: Trade was skipped (e.g., due to filters or limits)

##### Trade Outcome (Market Resolution)

| Field | Type | Description |
|-------|------|-------------|
| `outcome` | string \| null | Trade outcome: `"win"`, `"loss"`, `"pending"`, `"cancelled"` |
| `pnl` | string \| null | Profit/Loss in USDC (positive = profit, negative = loss). Only available for resolved trades. |
| `resolvedAt` | Date (ISO string) \| null | Timestamp when the market resolved |
| `resolutionPrice` | string \| null | Final price when the market resolved (0.00 or 1.00) |

**Outcome Values:**
- `win`: Trade resulted in a profit
- `loss`: Trade resulted in a loss
- `pending`: Market has not yet resolved
- `cancelled`: Market was cancelled

##### Current Value Tracking (Open Positions)

| Field | Type | Description |
|-------|------|-------------|
| `currentPrice` | string \| null | Current market price of the token (for open positions) |
| `currentValue` | string \| null | Current value of shares (shares × currentPrice) |
| `unrealizedPnl` | string \| null | Unrealized P/L for open positions (currentValue - costBasis) |
| `costBasis` | string \| null | Total cost basis (copiedAmount for buy trades) |
| `lastPriceUpdate` | Date (ISO string) \| null | Timestamp when current price was last updated |

**Note:** These fields are only populated for open positions (settled buy trades where the market hasn't resolved yet).

##### Failure Tracking

| Field | Type | Description |
|-------|------|-------------|
| `failureReason` | string \| null | Categorized failure reason (e.g., `"insufficient_balance"`, `"min_size"`, `"market_closed"`) |
| `failureCategory` | string \| null | Failure category: `"balance"`, `"validation"`, `"execution"`, `"market"`, `"other"` |

**Failure Categories:**
- `balance`: Insufficient balance or gas issues
- `validation`: Trade validation failed (e.g., min/max amount limits)
- `execution`: Order execution failed on CLOB
- `market`: Market-related issues (closed, invalid, etc.)
- `other`: Other types of failures

##### Redemption Tracking

| Field | Type | Description |
|-------|------|-------------|
| `redemptionStatus` | string \| null | Redemption status: `"pending"`, `"redeemed"`, `"failed"`, or `null` if not applicable |
| `redemptionTxHash` | string \| null | Transaction hash for redemption |
| `redeemedAt` | Date (ISO string) \| null | Timestamp when position was redeemed |
| `redemptionError` | string \| null | Error message if redemption failed |

##### Configuration Information

| Field | Type | Description |
|-------|------|-------------|
| `config` | object | Configuration information (nested object) |
| `config.id` | string | Configuration ID |
| `config.targetTraderAddress` | string | Target trader address |
| `config.traderInfo` | TraderInfo \| null | Trader information (may be null for older configs) |

**TraderInfo Object** (same structure as in config endpoint):
```typescript
{
  address: string;
  isValid: boolean;
  totalTrades?: number;
  totalVolume?: string;
  activePositions?: number;
  winRate?: number;
  lastTradeTimestamp?: number;
  marketsTraded?: string[];
  buyTrades?: number;
  sellTrades?: number;
  userInfo?: {
    name?: string;
    pseudonym?: string;
    bio?: string;
    profileImage?: string;
  };
}
```

### Empty Result Response

If no trades match the filters, the response will be:

```json
{
  "trades": [],
  "total": 0,
  "limit": 50,
  "offset": 0
}
```

---

### Error Responses

#### 401 Unauthorized - Missing Token

```json
{
  "error": "Access token required"
}
```

**Cause:** No `Authorization` header provided or token is missing.

#### 401 Unauthorized - Invalid Token

```json
{
  "error": "Invalid token"
}
```

**Cause:** JWT token is malformed or invalid.

#### 401 Unauthorized - Expired Token

```json
{
  "error": "Token expired"
}
```

**Cause:** JWT token has expired. User needs to refresh their token.

#### 401 Unauthorized - User Not Authenticated

```json
{
  "error": "User not authenticated"
}
```

**Cause:** Token verification failed or user ID is missing from token.

#### 500 Internal Server Error

```json
{
  "error": "Failed to fetch trade history",
  "message": "Error details..."
}
```

**Cause:** Server error occurred while fetching trade history. Check server logs for details.

---

## Pagination

The endpoint supports pagination using `limit` and `offset` query parameters:

- **`limit`**: Maximum number of trades to return (default: 50, recommended max: 100)
- **`offset`**: Number of trades to skip (default: 0)

### Pagination Example

```typescript
// Page 1: Get first 25 trades
const page1 = await getTradeHistory(token, { limit: 25, offset: 0 });

// Page 2: Get next 25 trades
const page2 = await getTradeHistory(token, { limit: 25, offset: 25 });

// Page 3: Get next 25 trades
const page3 = await getTradeHistory(token, { limit: 25, offset: 50 });
```

### Calculating Total Pages

```typescript
const totalPages = Math.ceil(response.total / response.limit);
const currentPage = Math.floor(response.offset / response.limit) + 1;
```

---

## Filtering

### Status Filter

Filter trades by their execution status:

- `pending`: Trades queued but not yet submitted
- `executed`: Trades submitted but not yet settled
- `settled`: Trades successfully settled on-chain
- `failed`: Trades that failed to execute
- `skipped`: Trades that were skipped

### Trade Type Filter

Filter trades by type:

- `buy`: Only buy trades
- `sell`: Only sell trades

### Configuration ID Filter

Filter trades from a specific copy trading configuration:

```typescript
const configTrades = await getTradeHistory(token, {
  configId: '550e8400-e29b-41d4-a716-446655440000',
});
```

### Combining Filters

You can combine multiple filters:

```typescript
// Get settled buy trades from a specific config
const settledBuys = await getTradeHistory(token, {
  status: 'settled',
  tradeType: 'buy',
  configId: '550e8400-e29b-41d4-a716-446655440000',
  limit: 20,
});
```

---

## Use Cases

1. **Trade History Dashboard**
   - Display all user's trades across all configurations
   - Show trade status, P/L, and market information

2. **Performance Analysis**
   - Calculate total P/L from resolved trades
   - Track win rate and average trade size
   - Analyze performance by configuration or trader

3. **Open Positions Monitoring**
   - Display all open positions (settled buy trades with pending outcome)
   - Show unrealized P/L and current market prices

4. **Failed Trade Analysis**
   - Filter failed trades to identify issues
   - Group by failure category for troubleshooting

5. **Configuration-Specific History**
   - View trades for a specific copy trading configuration
   - Compare performance across different configurations

6. **Trade Type Analysis**
   - Separate buy and sell trades for analysis
   - Calculate buy vs sell ratios

---

## Frontend Implementation Guide

### TypeScript Interfaces

```typescript
interface CopiedTrade {
  id: string;
  configId: string;
  originalTrader: string;
  originalTxHash: string;
  marketId: string;
  marketQuestion: string | null;
  outcomeIndex: number;
  tradeType: 'buy' | 'sell';
  originalAmount: string;
  originalPrice: string | null;
  originalShares: string | null;
  orderId: string | null;
  orderStatus: string | null;
  copiedTxHash: string | null;
  copiedAmount: string;
  copiedPrice: string | null;
  copiedShares: string | null;
  status: 'pending' | 'executed' | 'settled' | 'failed' | 'skipped';
  errorMessage: string | null;
  submittedAt: string | null;
  settledAt: string | null;
  outcome: 'win' | 'loss' | 'pending' | 'cancelled' | null;
  pnl: string | null;
  resolvedAt: string | null;
  resolutionPrice: string | null;
  currentPrice: string | null;
  currentValue: string | null;
  unrealizedPnl: string | null;
  costBasis: string | null;
  lastPriceUpdate: string | null;
  failureReason: string | null;
  failureCategory: string | null;
  redemptionStatus: string | null;
  redemptionTxHash: string | null;
  redeemedAt: string | null;
  redemptionError: string | null;
  executedAt: string | null;
  createdAt: string;
  config: {
    id: string;
    targetTraderAddress: string;
    traderInfo: TraderInfo | null;
  };
}

interface TradeHistoryResponse {
  trades: CopiedTrade[];
  total: number;
  limit: number;
  offset: number;
}

interface TraderInfo {
  address: string;
  isValid: boolean;
  totalTrades?: number;
  totalVolume?: string;
  activePositions?: number;
  winRate?: number;
  lastTradeTimestamp?: number;
  marketsTraded?: string[];
  buyTrades?: number;
  sellTrades?: number;
  userInfo?: {
    name?: string;
    pseudonym?: string;
    bio?: string;
    profileImage?: string;
  };
}
```

### React Component Example

```typescript
import React, { useState, useEffect } from 'react';

interface TradeHistoryProps {
  token: string;
  configId?: string;
}

function TradeHistory({ token, configId }: TradeHistoryProps) {
  const [trades, setTrades] = useState<CopiedTrade[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [tradeTypeFilter, setTradeTypeFilter] = useState<string>('');
  const limit = 25;

  useEffect(() => {
    async function fetchTrades() {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          limit: limit.toString(),
          offset: ((page - 1) * limit).toString(),
        });
        
        if (statusFilter) params.append('status', statusFilter);
        if (tradeTypeFilter) params.append('tradeType', tradeTypeFilter);
        if (configId) params.append('configId', configId);

        const response = await fetch(
          `https://poly.dev.api.polysignal.io/api/trade-history/user?${params.toString()}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Authentication failed. Please log in again.');
          }
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch trades');
        }

        const data: TradeHistoryResponse = await response.json();
        setTrades(data.trades);
        setTotal(data.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchTrades();
  }, [token, page, statusFilter, tradeTypeFilter, configId]);

  const totalPages = Math.ceil(total / limit);

  if (loading) return <div>Loading trades...</div>;
  if (error) return <div>Error: {error}</div>;
  if (trades.length === 0) return <div>No trades found.</div>;

  return (
    <div>
      <h2>Trade History</h2>
      <div className="filters">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="executed">Executed</option>
          <option value="settled">Settled</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
        </select>
        
        <select
          value={tradeTypeFilter}
          onChange={(e) => {
            setTradeTypeFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Types</option>
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </select>
      </div>

      <div className="trades-list">
        {trades.map((trade) => (
          <div key={trade.id} className="trade-card">
            <div className="trade-header">
              <span className={`status ${trade.status}`}>{trade.status}</span>
              <span className={`type ${trade.tradeType}`}>{trade.tradeType}</span>
            </div>
            
            <h3>{trade.marketQuestion || 'Unknown Market'}</h3>
            
            <div className="trade-details">
              <p>Amount: {trade.copiedAmount} USDC</p>
              {trade.copiedPrice && <p>Price: {trade.copiedPrice}</p>}
              {trade.copiedShares && <p>Shares: {trade.copiedShares}</p>}
              
              {trade.outcome && (
                <p className={`outcome ${trade.outcome}`}>
                  Outcome: {trade.outcome}
                  {trade.pnl && (
                    <span className={parseFloat(trade.pnl) >= 0 ? 'profit' : 'loss'}>
                      P/L: {trade.pnl} USDC
                    </span>
                  )}
                </p>
              )}
              
              {trade.unrealizedPnl && (
                <p>Unrealized P/L: {trade.unrealizedPnl} USDC</p>
              )}
              
              {trade.errorMessage && (
                <p className="error">Error: {trade.errorMessage}</p>
              )}
            </div>
            
            <div className="trade-meta">
              <p>Created: {new Date(trade.createdAt).toLocaleString()}</p>
              {trade.settledAt && (
                <p>Settled: {new Date(trade.settledAt).toLocaleString()}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="pagination">
        <button
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages} (Total: {total} trades)
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default TradeHistory;
```

### Handling Empty Results

```typescript
if (trades.length === 0) {
  return (
    <div>
      <p>No trades found matching your filters.</p>
      <button onClick={() => {
        setStatusFilter('');
        setTradeTypeFilter('');
        setPage(1);
      }}>
        Clear Filters
      </button>
    </div>
  );
}
```

### Error Handling Best Practices

1. **Handle 401 Errors**: Redirect to login page or refresh token
2. **Handle Network Errors**: Show retry option
3. **Handle Empty Results**: Show helpful message
4. **Handle Invalid Filters**: Validate filter values before sending request

```typescript
function handleTradeHistoryError(error: any, response: Response) {
  if (response.status === 401) {
    // Token expired or invalid - redirect to login
    window.location.href = '/login';
  } else if (response.status >= 500) {
    // Server error - show retry option
    return 'Server error. Please try again later.';
  } else {
    // Other errors
    return error.message || 'Failed to fetch trade history';
  }
}
```

---

## Important Notes

1. **Authentication Required**: This endpoint always requires JWT authentication. Ensure the token is valid and not expired.

2. **User-Scoped**: The endpoint only returns trades from configurations belonging to the authenticated user. Users cannot access other users' trades.

3. **Ordering**: Trades are returned in descending order by creation date (newest first).

4. **Pagination**: Use `limit` and `offset` for pagination. The `total` field indicates the total number of trades matching the filters (before pagination).

5. **Optional Fields**: Many fields are optional (`null`). Always check for existence before using them in the frontend.

6. **Date Fields**: Date fields are returned as ISO 8601 strings. Parse them as needed (e.g., `new Date(trade.createdAt)`).

7. **Amount Strings**: All amount fields are returned as strings to preserve precision. Parse them as needed (e.g., `parseFloat()` or `BigNumber` for precise calculations).

8. **Status Transitions**: Trade status follows this flow: `pending` → `executed` → `settled` (or `failed`/`skipped`).

9. **Outcome Availability**: The `outcome` and `pnl` fields are only available after a market resolves. For open positions, these will be `null`.

10. **Current Price Updates**: The `currentPrice`, `currentValue`, and `unrealizedPnl` fields are updated periodically for open positions. They may be `null` if the price hasn't been updated yet.

11. **Filter Combinations**: All filters can be combined. The endpoint returns trades that match ALL specified filters.

12. **Performance**: For large datasets, use appropriate `limit` values (recommended: 25-50) and implement pagination to avoid loading too much data at once.

---

## Related Endpoints

- **`GET /api/trade-history/config/{configId}`**: Get trade history for a specific configuration
- **`GET /api/trade-history/user/stats`**: Get overall trade statistics for the user
- **`GET /api/trade-history/config/{configId}/stats`**: Get trade statistics for a specific configuration
- **`GET /api/trade-history/failures`**: Get failure statistics grouped by category and reason
- **`GET /api/copytrading/config`**: Get all copy trading configurations

