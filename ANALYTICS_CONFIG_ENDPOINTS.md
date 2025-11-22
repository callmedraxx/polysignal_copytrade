# Analytics Configuration Endpoints Documentation

This document describes two analytics endpoints that provide detailed information about copy trading configurations: statistics and trade history.

---

## Endpoint 1: Get Configuration Statistics

### Endpoint

**`GET /analytics/config/{configId}/stats`**

This endpoint retrieves comprehensive statistics for a specific copy trading configuration. It provides aggregated metrics including total trades, win/loss counts, PnL, win rate, volume, and best/worst trade information.

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

**Note:** If authentication fails or the token is missing, the endpoint returns a `401 Unauthorized` response. The endpoint also verifies that the configuration belongs to the authenticated user.

---

## Request

### URL
```
GET /analytics/config/{configId}/stats
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `configId` | string | Yes | The unique identifier of the copy trading configuration |

### Headers
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Request Body
None - This is a GET request with no body parameters.

### Example Request

```bash
curl -X GET 'https://poly.dev.api.polysignal.io/analytics/config/abc123def456/stats' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json'
```

### Frontend Example (JavaScript/TypeScript)

```typescript
async function getConfigStatistics(configId: string, token: string) {
  const response = await fetch(
    `https://poly.dev.api.polysignal.io/analytics/config/${configId}/stats`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get configuration statistics');
  }
  
  return await response.json();
}

// Usage
try {
  const stats = await getConfigStatistics('abc123def456', userToken);
  console.log('Configuration statistics:', stats);
} catch (error) {
  console.error('Error fetching statistics:', error);
}
```

### React Hook Example

```typescript
import { useState, useEffect } from 'react';

interface TradeStatistics {
  totalTrades: number;
  executedTrades: number;
  pendingTrades: number;
  failedTrades: number;
  wins: number;
  losses: number;
  pendingOutcomes: number;
  totalPnL: string;
  winRate: number;
  totalVolume: string;
  averageTradeSize: string;
  bestTrade: {
    pnl: string;
    marketQuestion: string;
    tradeType: string;
  } | null;
  worstTrade: {
    pnl: string;
    marketQuestion: string;
    tradeType: string;
  } | null;
}

function useConfigStatistics(configId: string | null, token: string | null) {
  const [stats, setStats] = useState<TradeStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configId || !token) return;

    setLoading(true);
    setError(null);

    fetch(`https://poly.dev.api.polysignal.io/analytics/config/${configId}/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to fetch statistics');
        }
        return res.json();
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [configId, token]);

  return { stats, loading, error };
}

// Usage in component
function ConfigStatsPanel({ configId, token }: { configId: string; token: string }) {
  const { stats, loading, error } = useConfigStatistics(configId, token);

  if (loading) return <div>Loading statistics...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!stats) return null;

  return (
    <div>
      <h2>Configuration Statistics</h2>
      <p>Total Trades: {stats.totalTrades}</p>
      <p>Win Rate: {stats.winRate}%</p>
      <p>Total PnL: ${stats.totalPnL}</p>
      <p>Total Volume: ${stats.totalVolume}</p>
      {stats.bestTrade && (
        <div>
          <h3>Best Trade</h3>
          <p>PnL: ${stats.bestTrade.pnl}</p>
          <p>Market: {stats.bestTrade.marketQuestion}</p>
        </div>
      )}
    </div>
  );
}
```

---

## Response

### Success Response (200 OK)

The response contains comprehensive statistics about the copy trading configuration.

**Response Body Structure:**

```json
{
  "totalTrades": 150,
  "executedTrades": 142,
  "pendingTrades": 5,
  "failedTrades": 3,
  "wins": 85,
  "losses": 57,
  "pendingOutcomes": 0,
  "totalPnL": "1250.50",
  "winRate": 59.86,
  "totalVolume": "50000.00",
  "averageTradeSize": "352.11",
  "bestTrade": {
    "pnl": "250.00",
    "marketQuestion": "Will Bitcoin reach $100k by end of 2024?",
    "tradeType": "buy"
  },
  "worstTrade": {
    "pnl": "-150.00",
    "marketQuestion": "Will Ethereum drop below $2000?",
    "tradeType": "buy"
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `totalTrades` | number | Total number of trades (all statuses) for this configuration |
| `executedTrades` | number | Number of trades that were successfully executed |
| `pendingTrades` | number | Number of trades currently pending execution |
| `failedTrades` | number | Number of trades that failed to execute |
| `wins` | number | Number of trades that resulted in a win |
| `losses` | number | Number of trades that resulted in a loss |
| `pendingOutcomes` | number | Number of executed trades that haven't been resolved yet |
| `totalPnL` | string | Total profit and loss in USDC (6 decimal precision) |
| `winRate` | number | Win rate percentage (0-100), calculated as wins / (wins + losses) |
| `totalVolume` | string | Total volume traded in USDC (6 decimal precision) |
| `averageTradeSize` | string | Average trade size in USDC (6 decimal precision) |
| `bestTrade` | object \| null | Information about the best performing trade |
| `bestTrade.pnl` | string | Profit and loss of the best trade in USDC |
| `bestTrade.marketQuestion` | string | The market question for the best trade |
| `bestTrade.tradeType` | string | Type of trade ("buy" or "sell") |
| `worstTrade` | object \| null | Information about the worst performing trade |
| `worstTrade.pnl` | string | Profit and loss of the worst trade in USDC |
| `worstTrade.marketQuestion` | string | The market question for the worst trade |
| `worstTrade.tradeType` | string | Type of trade ("buy" or "sell") |

**Note:** If there are no resolved trades, `bestTrade` and `worstTrade` will be `null`. The `winRate` is calculated only from resolved trades (wins + losses), excluding pending outcomes.

### Error Responses

#### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```
**Cause:** Missing or invalid JWT token.

#### 404 Not Found
```json
{
  "error": "Copy trading configuration not found"
}
```
**Cause:** The configuration ID doesn't exist or doesn't belong to the authenticated user.

#### 500 Internal Server Error
```json
{
  "error": "Failed to get statistics"
}
```
**Cause:** An unexpected server error occurred while processing the request.

---

## Use Cases

### 1. Dashboard Performance Overview
Use this endpoint to display a quick overview of how a specific copy trading configuration is performing:
- Total trades executed
- Win rate percentage
- Total profit/loss
- Best and worst trades for quick insights

### 2. Configuration Comparison
Compare multiple configurations by fetching statistics for each and comparing:
- Win rates
- Total PnL
- Average trade sizes
- Success rates (executed vs failed)

### 3. Performance Monitoring
Monitor configuration performance over time by periodically fetching statistics and tracking:
- Changes in win rate
- PnL trends
- Trade execution success rate

### 4. Risk Assessment
Evaluate the risk profile of a configuration:
- Win/loss ratio
- Best and worst trade outcomes
- Average trade size relative to total volume

---

## Endpoint 2: Get Configuration Trade History

### Endpoint

**`GET /analytics/config/{configId}/history`**

This endpoint retrieves detailed trade history for a specific copy trading configuration. It provides a paginated list of all trades with comprehensive details including market information, trade execution data, PnL, and status.

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

**Note:** If authentication fails or the token is missing, the endpoint returns a `401 Unauthorized` response. The endpoint also verifies that the configuration belongs to the authenticated user.

---

## Request

### URL
```
GET /analytics/config/{configId}/history
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `configId` | string | Yes | The unique identifier of the copy trading configuration |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | integer | No | 50 | Maximum number of trades to return (pagination) |
| `offset` | integer | No | 0 | Number of trades to skip (pagination) |
| `status` | string | No | - | Filter trades by status. Valid values: `pending`, `executed`, `failed`, `skipped` |
| `outcome` | string | No | - | Filter trades by outcome. Valid values: `win`, `loss`, `pending`, `cancelled` |

### Headers
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Request Body
None - This is a GET request with no body parameters.

### Example Request

**Basic Request:**
```bash
curl -X GET 'https://poly.dev.api.polysignal.io/analytics/config/abc123def456/history' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json'
```

**With Query Parameters:**
```bash
curl -X GET 'https://poly.dev.api.polysignal.io/analytics/config/abc123def456/history?limit=100&offset=0&status=executed&outcome=win' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json'
```

### Frontend Example (JavaScript/TypeScript)

```typescript
interface TradeHistoryOptions {
  limit?: number;
  offset?: number;
  status?: 'pending' | 'executed' | 'failed' | 'skipped';
  outcome?: 'win' | 'loss' | 'pending' | 'cancelled';
}

interface Trade {
  id: string;
  originalTrader: string;
  originalTxHash: string;
  marketId: string;
  marketQuestion: string;
  outcomeIndex: number;
  tradeType: string;
  originalAmount: string;
  originalPrice: string;
  originalShares: string;
  copiedTxHash: string | null;
  copiedAmount: string | null;
  copiedPrice: string | null;
  copiedShares: string | null;
  status: string;
  outcome: string | null;
  pnl: string | null;
  resolvedAt: Date | null;
  resolutionPrice: string | null;
  executedAt: Date | null;
  createdAt: Date;
}

interface TradeHistoryResponse {
  trades: Trade[];
  total: number;
  page: number;
  pageSize: number;
}

async function getConfigTradeHistory(
  configId: string,
  token: string,
  options?: TradeHistoryOptions
): Promise<TradeHistoryResponse> {
  const params = new URLSearchParams();
  
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.offset) params.append('offset', options.offset.toString());
  if (options?.status) params.append('status', options.status);
  if (options?.outcome) params.append('outcome', options.outcome);

  const url = `https://poly.dev.api.polysignal.io/analytics/config/${configId}/history?${params.toString()}`;
  
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

// Usage
try {
  const history = await getConfigTradeHistory('abc123def456', userToken, {
    limit: 100,
    offset: 0,
    status: 'executed',
    outcome: 'win'
  });
  console.log(`Found ${history.total} trades, showing page ${history.page}`);
  console.log('Trades:', history.trades);
} catch (error) {
  console.error('Error fetching trade history:', error);
}
```

### React Hook Example with Pagination

```typescript
import { useState, useEffect } from 'react';

interface Trade {
  id: string;
  originalTrader: string;
  originalTxHash: string;
  marketId: string;
  marketQuestion: string;
  outcomeIndex: number;
  tradeType: string;
  originalAmount: string;
  originalPrice: string;
  originalShares: string;
  copiedTxHash: string | null;
  copiedAmount: string | null;
  copiedPrice: string | null;
  copiedShares: string | null;
  status: string;
  outcome: string | null;
  pnl: string | null;
  resolvedAt: Date | null;
  resolutionPrice: string | null;
  executedAt: Date | null;
  createdAt: Date;
}

interface TradeHistoryResponse {
  trades: Trade[];
  total: number;
  page: number;
  pageSize: number;
}

function useConfigTradeHistory(
  configId: string | null,
  token: string | null,
  options?: {
    limit?: number;
    offset?: number;
    status?: string;
    outcome?: string;
  }
) {
  const [history, setHistory] = useState<TradeHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configId || !token) return;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.status) params.append('status', options.status);
    if (options?.outcome) params.append('outcome', options.outcome);

    fetch(`https://poly.dev.api.polysignal.io/analytics/config/${configId}/history?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to fetch trade history');
        }
        return res.json();
      })
      .then((data) => {
        setHistory(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [configId, token, options?.limit, options?.offset, options?.status, options?.outcome]);

  return { history, loading, error };
}

// Usage in component
function TradeHistoryTable({ configId, token }: { configId: string; token: string }) {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const pageSize = 50;

  const { history, loading, error } = useConfigTradeHistory(
    configId,
    token,
    {
      limit: pageSize,
      offset: page * pageSize,
      status: statusFilter || undefined,
    }
  );

  if (loading) return <div>Loading trade history...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!history) return null;

  const totalPages = Math.ceil(history.total / pageSize);

  return (
    <div>
      <div>
        <label>
          Filter by Status:
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="executed">Executed</option>
            <option value="failed">Failed</option>
            <option value="skipped">Skipped</option>
          </select>
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th>Market Question</th>
            <th>Type</th>
            <th>Status</th>
            <th>Outcome</th>
            <th>PnL</th>
            <th>Created At</th>
          </tr>
        </thead>
        <tbody>
          {history.trades.map((trade) => (
            <tr key={trade.id}>
              <td>{trade.marketQuestion}</td>
              <td>{trade.tradeType}</td>
              <td>{trade.status}</td>
              <td>{trade.outcome || 'N/A'}</td>
              <td>{trade.pnl ? `$${trade.pnl}` : 'N/A'}</td>
              <td>{new Date(trade.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
          Previous
        </button>
        <span>Page {history.page} of {totalPages} (Total: {history.total} trades)</span>
        <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
          Next
        </button>
      </div>
    </div>
  );
}
```

---

## Response

### Success Response (200 OK)

The response contains a paginated list of trades with metadata.

**Response Body Structure:**

```json
{
  "trades": [
    {
      "id": "trade_123",
      "originalTrader": "0x1234567890abcdef1234567890abcdef12345678",
      "originalTxHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      "marketId": "0xmarket123",
      "marketQuestion": "Will Bitcoin reach $100k by end of 2024?",
      "outcomeIndex": 0,
      "tradeType": "buy",
      "originalAmount": "1000.000000",
      "originalPrice": "0.65",
      "originalShares": "1538.46",
      "copiedTxHash": "0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba",
      "copiedAmount": "500.000000",
      "copiedPrice": "0.65",
      "copiedShares": "769.23",
      "status": "executed",
      "outcome": "win",
      "pnl": "125.50",
      "resolvedAt": "2024-01-15T10:30:00Z",
      "resolutionPrice": "0.75",
      "executedAt": "2024-01-10T08:15:00Z",
      "createdAt": "2024-01-10T08:14:30Z"
    },
    {
      "id": "trade_124",
      "originalTrader": "0x1234567890abcdef1234567890abcdef12345678",
      "originalTxHash": "0x1111111111111111111111111111111111111111111111111111111111111111",
      "marketId": "0xmarket456",
      "marketQuestion": "Will Ethereum drop below $2000?",
      "outcomeIndex": 1,
      "tradeType": "buy",
      "originalAmount": "2000.000000",
      "originalPrice": "0.40",
      "originalShares": "5000.00",
      "copiedTxHash": null,
      "copiedAmount": "1000.000000",
      "copiedPrice": "0.40",
      "copiedShares": "2500.00",
      "status": "pending",
      "outcome": null,
      "pnl": null,
      "resolvedAt": null,
      "resolutionPrice": null,
      "executedAt": null,
      "createdAt": "2024-01-12T14:20:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "pageSize": 50
}
```

### Response Fields

#### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `trades` | array | Array of trade objects (see Trade Object below) |
| `total` | number | Total number of trades matching the filter criteria |
| `page` | number | Current page number (1-indexed) |
| `pageSize` | number | Number of trades per page |

#### Trade Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for the trade |
| `originalTrader` | string | Wallet address of the trader being copied |
| `originalTxHash` | string | Transaction hash of the original trade on Polymarket |
| `marketId` | string | Unique identifier of the prediction market |
| `marketQuestion` | string | The question/title of the prediction market |
| `outcomeIndex` | number | Index of the outcome being traded (0-based) |
| `tradeType` | string | Type of trade: `"buy"` or `"sell"` |
| `originalAmount` | string | Original trade amount in USDC (6 decimals) |
| `originalPrice` | string | Price per share of the original trade |
| `originalShares` | string | Number of shares in the original trade |
| `copiedTxHash` | string \| null | Transaction hash of the copied trade (null if not executed) |
| `copiedAmount` | string \| null | Amount copied in USDC (6 decimals, null if not executed) |
| `copiedPrice` | string \| null | Price per share of the copied trade (null if not executed) |
| `copiedShares` | string \| null | Number of shares in the copied trade (null if not executed) |
| `status` | string | Current status: `"pending"`, `"executed"`, `"failed"`, or `"skipped"` |
| `outcome` | string \| null | Trade outcome: `"win"`, `"loss"`, `"pending"`, or `"cancelled"` (null if not resolved) |
| `pnl` | string \| null | Profit and loss in USDC (6 decimals, null if not resolved) |
| `resolvedAt` | string \| null | ISO 8601 timestamp when the trade was resolved (null if not resolved) |
| `resolutionPrice` | string \| null | Final resolution price of the market (null if not resolved) |
| `executedAt` | string \| null | ISO 8601 timestamp when the trade was executed (null if not executed) |
| `createdAt` | string | ISO 8601 timestamp when the trade was created |

**Note:** Trades are returned in descending order by creation date (newest first).

### Error Responses

#### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```
**Cause:** Missing or invalid JWT token.

#### 404 Not Found
```json
{
  "error": "Copy trading configuration not found"
}
```
**Cause:** The configuration ID doesn't exist or doesn't belong to the authenticated user.

#### 500 Internal Server Error
```json
{
  "error": "Failed to get trade history"
}
```
**Cause:** An unexpected server error occurred while processing the request.

---

## Use Cases

### 1. Trade History Table/List
Display a paginated table of all trades for a configuration with filtering capabilities:
- Filter by status (pending, executed, failed, skipped)
- Filter by outcome (win, loss, pending, cancelled)
- Paginate through large trade histories
- Show detailed trade information including PnL

### 2. Trade Analysis
Analyze individual trades to understand:
- Which markets are being traded
- Trade execution success rate
- Price differences between original and copied trades
- Timing of trades (created vs executed)

### 3. Performance Tracking
Track the performance of specific trades:
- Monitor pending trades
- Review resolved trades and their outcomes
- Calculate cumulative PnL from the trade list

### 4. Debugging and Support
Use detailed trade information for:
- Debugging failed trades
- Investigating execution issues
- Providing support with specific trade details

### 5. Export and Reporting
Export trade history for:
- Tax reporting
- Performance analysis
- Record keeping
- Third-party integrations

---

## Combining Both Endpoints

These two endpoints work well together to provide a complete view of a configuration's performance:

1. **Use `/stats` for Overview**: Get quick summary statistics for dashboards and overview pages
2. **Use `/history` for Details**: Drill down into specific trades when users need more information

### Example: Dashboard Implementation

```typescript
async function getConfigAnalytics(configId: string, token: string) {
  // Get overview statistics
  const stats = await getConfigStatistics(configId, token);
  
  // Get recent trade history (first page)
  const history = await getConfigTradeHistory(configId, token, {
    limit: 10,
    offset: 0,
  });
  
  return {
    overview: stats,
    recentTrades: history.trades,
    totalTrades: history.total,
  };
}
```

This approach allows you to:
- Display summary metrics at the top
- Show recent trades below
- Provide links to view full history
- Update statistics and recent trades independently

---

## Best Practices

### 1. Caching
- Cache statistics responses for a short period (e.g., 30-60 seconds) to reduce server load
- Trade history can be cached less aggressively since it changes less frequently

### 2. Pagination
- Always implement pagination for trade history to avoid loading too much data at once
- Consider implementing infinite scroll or "load more" functionality for better UX

### 3. Error Handling
- Always handle 404 errors gracefully (configuration may have been deleted)
- Show user-friendly error messages
- Implement retry logic for transient errors

### 4. Loading States
- Show loading indicators while fetching data
- Consider skeleton screens for better perceived performance

### 5. Filtering
- Use query parameters to maintain filter state in the URL
- This allows users to bookmark filtered views and share links

---

## Rate Limiting

These endpoints are subject to rate limiting. Check the rate limiter service configuration for specific limits. If you encounter rate limit errors, implement exponential backoff and retry logic.

---

## Notes

- All monetary values (amounts, PnL) are in USDC with 6 decimal precision
- Timestamps are in ISO 8601 format (UTC)
- Trade statuses and outcomes are case-sensitive
- The `winRate` in statistics is calculated only from resolved trades (wins + losses)
- Trades are ordered by creation date (newest first) in the history endpoint

