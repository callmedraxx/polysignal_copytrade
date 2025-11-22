# Trade History User Stats Endpoint Documentation

## Endpoint

**`GET /api/trade-history/user/stats`**

This endpoint retrieves overall trade statistics for the authenticated user across all their copy trading configurations. It provides aggregated metrics including total trades, success/failure counts, profit/loss calculations, investment totals, and win rate. This is useful for displaying a high-level overview of the user's copy trading performance.

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
GET /api/trade-history/user/stats
```

### Headers
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Query Parameters
None - This endpoint does not accept any query parameters.

### Request Body
None - This is a GET request with no body parameters.

### Example Request

```bash
curl -X GET 'https://poly.dev.api.polysignal.io/api/trade-history/user/stats' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json'
```

### Frontend Example (JavaScript/TypeScript)

```typescript
async function getUserTradeStats(token: string) {
  const response = await fetch(
    'https://poly.dev.api.polysignal.io/api/trade-history/user/stats',
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
    throw new Error(error.error || 'Failed to get trade statistics');
  }
  
  return await response.json();
}

// Usage
try {
  const stats = await getUserTradeStats(userToken);
  console.log('Trade statistics:', stats);
  console.log('Total P/L:', stats.totalPnl);
  console.log('Win Rate:', stats.winRate + '%');
} catch (error) {
  console.error('Error fetching trade statistics:', error);
}
```

### React Hook Example

```typescript
import { useState, useEffect } from 'react';

interface TradeStats {
  totalTrades: number;
  successful: number;
  failed: number;
  pending: number;
  realizedPnl: string;
  unrealizedPnl: string;
  totalPnl: string;
  totalInvested: string;
  totalReturned: string;
  winRate: string;
  totalConfigs: number;
}

function useTradeStats(token: string) {
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const response = await fetch(
          'https://poly.dev.api.polysignal.io/api/trade-history/user/stats',
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
          throw new Error(errorData.error || 'Failed to fetch statistics');
        }

        const data = await response.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchStats();
    }
  }, [token]);

  return { stats, loading, error };
}

// Usage in component
function Dashboard() {
  const { stats, loading, error } = useTradeStats(userToken);

  if (loading) return <div>Loading statistics...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!stats) return <div>No statistics available</div>;

  return (
    <div>
      <h2>Trade Statistics</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Trades</h3>
          <p>{stats.totalTrades}</p>
        </div>
        <div className="stat-card">
          <h3>Total P/L</h3>
          <p className={parseFloat(stats.totalPnl) >= 0 ? 'profit' : 'loss'}>
            {stats.totalPnl} USDC
          </p>
        </div>
        <div className="stat-card">
          <h3>Win Rate</h3>
          <p>{stats.winRate}%</p>
        </div>
        <div className="stat-card">
          <h3>Total Invested</h3>
          <p>{stats.totalInvested} USDC</p>
        </div>
      </div>
    </div>
  );
}
```

---

## Response

### Success Response (200 OK)

The endpoint returns an object containing aggregated trade statistics.

```json
{
  "totalTrades": 150,
  "successful": 120,
  "failed": 15,
  "pending": 15,
  "realizedPnl": "1250.500000",
  "unrealizedPnl": "350.250000",
  "totalPnl": "1600.750000",
  "totalInvested": "10000.000000",
  "totalReturned": "8500.000000",
  "winRate": "65.50",
  "totalConfigs": 5
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `totalTrades` | number | Total number of trades across all configurations |
| `successful` | number | Number of trades with status `settled` or `executed` |
| `failed` | number | Number of trades with status `failed` |
| `pending` | number | Number of trades with status `pending` or `executed` (not yet settled) |
| `realizedPnl` | string | Total realized profit/loss in USDC (from resolved trades). Formatted to 6 decimal places. Positive values indicate profit, negative values indicate loss. |
| `unrealizedPnl` | string | Total unrealized profit/loss in USDC (from open positions). Formatted to 6 decimal places. Positive values indicate profit, negative values indicate loss. |
| `totalPnl` | string | Total profit/loss (realized + unrealized) in USDC. Formatted to 6 decimal places. |
| `totalInvested` | string | Total amount invested in USDC (sum of cost basis for all buy trades). Formatted to 6 decimal places. |
| `totalReturned` | string | Total amount returned in USDC (sum of amounts from all sell trades). Formatted to 6 decimal places. |
| `winRate` | string | Win rate as a percentage (0-100). Formatted to 2 decimal places. Calculated as: (winning trades / resolved trades) × 100. Returns `"0.00"` if there are no resolved trades. |
| `totalConfigs` | number | Total number of copy trading configurations the user has |

### Field Details

#### Trade Counts

- **`totalTrades`**: Counts all trades across all user's configurations, regardless of status
- **`successful`**: Trades that have been successfully executed and settled (`status === 'settled'` or `status === 'executed'`)
- **`failed`**: Trades that failed to execute (`status === 'failed'`)
- **`pending`**: Trades that are still in progress (`status === 'pending'` or `status === 'executed'` but not yet settled)

#### Profit/Loss Calculations

- **`realizedPnl`**: Sum of P/L from all resolved trades (trades where `outcome` is set and `pnl` is available). This represents closed positions.
- **`unrealizedPnl`**: Sum of unrealized P/L from all open positions (settled buy trades where market hasn't resolved yet and `unrealizedPnl` is available). This represents open positions.
- **`totalPnl`**: Sum of `realizedPnl` and `unrealizedPnl`. This is the total profit/loss including both closed and open positions.

**Note:** All P/L values are in USDC and formatted as strings with 6 decimal places to preserve precision.

#### Investment Metrics

- **`totalInvested`**: Sum of `costBasis` (or `copiedAmount` if `costBasis` is not available) for all buy trades. This represents the total capital deployed.
- **`totalReturned`**: Sum of `copiedAmount` for all sell trades. This represents the total capital returned from selling positions.

#### Win Rate

- **`winRate`**: Calculated as `(winning trades / resolved trades) × 100`
  - Winning trades: Resolved trades where `pnl > 0`
  - Resolved trades: Trades where `outcome` is set and `pnl` is available
  - Returns `"0.00"` if there are no resolved trades
  - Formatted as a string with 2 decimal places (e.g., `"65.50"` means 65.50%)

#### Configuration Count

- **`totalConfigs`**: Total number of copy trading configurations the user has created (regardless of whether they are enabled or have trades)

### Example Response Scenarios

#### New User (No Trades)
```json
{
  "totalTrades": 0,
  "successful": 0,
  "failed": 0,
  "pending": 0,
  "realizedPnl": "0.000000",
  "unrealizedPnl": "0.000000",
  "totalPnl": "0.000000",
  "totalInvested": "0.000000",
  "totalReturned": "0.000000",
  "winRate": "0.00",
  "totalConfigs": 2
}
```

#### User with Only Open Positions
```json
{
  "totalTrades": 50,
  "successful": 50,
  "failed": 0,
  "pending": 0,
  "realizedPnl": "0.000000",
  "unrealizedPnl": "250.500000",
  "totalPnl": "250.500000",
  "totalInvested": "5000.000000",
  "totalReturned": "0.000000",
  "winRate": "0.00",
  "totalConfigs": 3
}
```

#### User with Mixed Results
```json
{
  "totalTrades": 200,
  "successful": 180,
  "failed": 10,
  "pending": 10,
  "realizedPnl": "-150.250000",
  "unrealizedPnl": "75.500000",
  "totalPnl": "-74.750000",
  "totalInvested": "15000.000000",
  "totalReturned": "12000.000000",
  "winRate": "45.25",
  "totalConfigs": 4
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
  "error": "Failed to fetch trade statistics",
  "message": "Error details..."
}
```

**Cause:** Server error occurred while calculating statistics. Check server logs for details.

---

## How Statistics Are Calculated

### Trade Status Classification

The endpoint aggregates trades based on their status:

1. **Successful Trades**: Trades with `status === 'settled'` OR `status === 'executed'`
2. **Failed Trades**: Trades with `status === 'failed'`
3. **Pending Trades**: Trades with `status === 'pending'` OR `status === 'executed'` (not yet settled)

### Realized P/L Calculation

Realized P/L is calculated from resolved trades:
- A trade is considered "resolved" if it has both `outcome` and `pnl` fields set
- The `pnl` value is summed across all resolved trades
- Positive `pnl` values indicate profit, negative values indicate loss

### Unrealized P/L Calculation

Unrealized P/L is calculated from open positions:
- An open position is a trade where:
  - `status === 'settled'`
  - `tradeType === 'buy'`
  - `outcome` is `null` (market hasn't resolved)
  - `unrealizedPnl` is available
- The `unrealizedPnl` value is summed across all open positions

### Investment Calculation

- **Total Invested**: Sum of `costBasis` (or `copiedAmount` if `costBasis` is not available) for all buy trades
- **Total Returned**: Sum of `copiedAmount` for all sell trades

### Win Rate Calculation

```
winRate = (winning trades / resolved trades) × 100
```

Where:
- **Winning trades**: Resolved trades where `pnl > 0`
- **Resolved trades**: Trades where both `outcome` and `pnl` are set
- If there are no resolved trades, win rate is `"0.00"`

---

## Use Cases

1. **Dashboard Overview**
   - Display high-level performance metrics
   - Show total P/L, win rate, and trade counts at a glance
   - Provide quick insights into overall copy trading performance

2. **Performance Summary**
   - Calculate return on investment (ROI)
   - Track realized vs unrealized gains
   - Monitor success rate across all configurations

3. **Portfolio Analysis**
   - Understand total capital deployed (`totalInvested`)
   - Track capital returned (`totalReturned`)
   - Calculate net position value

4. **Risk Assessment**
   - Monitor failed trade count
   - Track pending trades
   - Assess overall success rate

5. **Configuration Management**
   - See how many configurations are active (`totalConfigs`)
   - Compare performance across different configurations

6. **Financial Reporting**
   - Generate profit/loss reports
   - Track investment performance over time
   - Calculate win rate for strategy evaluation

---

## Frontend Implementation Guide

### TypeScript Interface

```typescript
interface TradeStats {
  totalTrades: number;
  successful: number;
  failed: number;
  pending: number;
  realizedPnl: string;
  unrealizedPnl: string;
  totalPnl: string;
  totalInvested: string;
  totalReturned: string;
  winRate: string;
  totalConfigs: number;
}
```

### React Component Example

```typescript
import React, { useState, useEffect } from 'react';

interface TradeStatsProps {
  token: string;
}

function TradeStats({ token }: TradeStatsProps) {
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const response = await fetch(
          'https://poly.dev.api.polysignal.io/api/trade-history/user/stats',
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
          throw new Error(errorData.error || 'Failed to fetch statistics');
        }

        const data = await response.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [token]);

  if (loading) return <div>Loading statistics...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!stats) return <div>No statistics available</div>;

  const totalPnl = parseFloat(stats.totalPnl);
  const realizedPnl = parseFloat(stats.realizedPnl);
  const unrealizedPnl = parseFloat(stats.unrealizedPnl);
  const totalInvested = parseFloat(stats.totalInvested);
  const roi = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  return (
    <div className="trade-stats">
      <h2>Trade Statistics</h2>
      
      <div className="stats-grid">
        {/* Trade Counts */}
        <div className="stat-card">
          <h3>Total Trades</h3>
          <p className="stat-value">{stats.totalTrades}</p>
          <div className="stat-breakdown">
            <span className="success">✓ {stats.successful} successful</span>
            <span className="failed">✗ {stats.failed} failed</span>
            <span className="pending">⏳ {stats.pending} pending</span>
          </div>
        </div>

        {/* Total P/L */}
        <div className="stat-card">
          <h3>Total Profit/Loss</h3>
          <p className={`stat-value ${totalPnl >= 0 ? 'profit' : 'loss'}`}>
            {totalPnl >= 0 ? '+' : ''}{stats.totalPnl} USDC
          </p>
          <div className="stat-breakdown">
            <span>Realized: {realizedPnl >= 0 ? '+' : ''}{stats.realizedPnl} USDC</span>
            <span>Unrealized: {unrealizedPnl >= 0 ? '+' : ''}{stats.unrealizedPnl} USDC</span>
          </div>
        </div>

        {/* Win Rate */}
        <div className="stat-card">
          <h3>Win Rate</h3>
          <p className="stat-value">{stats.winRate}%</p>
        </div>

        {/* ROI */}
        <div className="stat-card">
          <h3>Return on Investment</h3>
          <p className={`stat-value ${roi >= 0 ? 'profit' : 'loss'}`}>
            {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
          </p>
        </div>

        {/* Investment Metrics */}
        <div className="stat-card">
          <h3>Total Invested</h3>
          <p className="stat-value">{stats.totalInvested} USDC</p>
        </div>

        <div className="stat-card">
          <h3>Total Returned</h3>
          <p className="stat-value">{stats.totalReturned} USDC</p>
        </div>

        {/* Configurations */}
        <div className="stat-card">
          <h3>Active Configurations</h3>
          <p className="stat-value">{stats.totalConfigs}</p>
        </div>
      </div>
    </div>
  );
}

export default TradeStats;
```

### Styled Component Example

```typescript
import styled from 'styled-components';

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
`;

const StatCard = styled.div`
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  
  h3 {
    margin: 0 0 1rem 0;
    font-size: 0.9rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .stat-value {
    font-size: 2rem;
    font-weight: bold;
    margin: 0;
    
    &.profit {
      color: #10b981;
    }
    
    &.loss {
      color: #ef4444;
    }
  }
  
  .stat-breakdown {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: #888;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
`;
```

### Formatting Helpers

```typescript
// Format P/L values with proper sign and color
function formatPnL(value: string): { formatted: string; isProfit: boolean } {
  const num = parseFloat(value);
  return {
    formatted: `${num >= 0 ? '+' : ''}${value} USDC`,
    isProfit: num >= 0,
  };
}

// Format percentage
function formatPercentage(value: string): string {
  return `${value}%`;
}

// Calculate ROI
function calculateROI(totalPnl: string, totalInvested: string): number {
  const pnl = parseFloat(totalPnl);
  const invested = parseFloat(totalInvested);
  return invested > 0 ? (pnl / invested) * 100 : 0;
}

// Format large numbers
function formatNumber(value: string): string {
  const num = parseFloat(value);
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`;
  }
  return num.toFixed(2);
}
```

### Error Handling Best Practices

1. **Handle 401 Errors**: Redirect to login page or refresh token
2. **Handle Network Errors**: Show retry option
3. **Handle Empty Results**: Show helpful message for new users
4. **Handle Loading States**: Show skeleton loaders or spinners

```typescript
function handleStatsError(error: any, response: Response) {
  if (response.status === 401) {
    // Token expired or invalid - redirect to login
    window.location.href = '/login';
  } else if (response.status >= 500) {
    // Server error - show retry option
    return {
      message: 'Server error. Please try again later.',
      retryable: true,
    };
  } else {
    // Other errors
    return {
      message: error.message || 'Failed to fetch statistics',
      retryable: false,
    };
  }
}
```

### Auto-Refresh Example

```typescript
function useAutoRefreshTradeStats(token: string, intervalMs: number = 30000) {
  const { stats, loading, error, refetch } = useTradeStats(token);

  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      refetch();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [token, intervalMs, refetch]);

  return { stats, loading, error };
}
```

---

## Important Notes

1. **Authentication Required**: This endpoint always requires JWT authentication. Ensure the token is valid and not expired.

2. **User-Scoped**: The endpoint only returns statistics for trades from configurations belonging to the authenticated user. Users cannot access other users' statistics.

3. **Aggregated Data**: All statistics are aggregated across all user's configurations. For per-configuration statistics, use `GET /api/trade-history/config/{configId}/stats`.

4. **String Formatting**: All monetary values (`realizedPnl`, `unrealizedPnl`, `totalPnl`, `totalInvested`, `totalReturned`) are returned as strings with 6 decimal places to preserve precision. Parse them as needed (e.g., `parseFloat()`).

5. **Win Rate Format**: The `winRate` is returned as a string with 2 decimal places (e.g., `"65.50"`). It represents a percentage (0-100).

6. **Zero Values**: If a user has no trades, all numeric fields will be `0` and monetary fields will be `"0.000000"`. The `winRate` will be `"0.00"`.

7. **Realized vs Unrealized**: 
   - **Realized P/L**: Only includes closed positions (resolved trades)
   - **Unrealized P/L**: Only includes open positions (settled buy trades awaiting market resolution)
   - **Total P/L**: Sum of both realized and unrealized

8. **Pending Trades**: Trades with status `pending` or `executed` (not yet settled) are counted in `pending` but do not contribute to P/L calculations until they are settled.

9. **Failed Trades**: Failed trades are counted but do not contribute to P/L, investment, or return calculations.

10. **Performance**: This endpoint aggregates data from all user's configurations and trades. For users with many trades, the calculation may take a moment. Consider caching the results on the frontend.

11. **Real-time Updates**: Statistics are calculated in real-time based on current trade data. For frequently updating dashboards, consider implementing auto-refresh with appropriate intervals (e.g., every 30 seconds).

12. **ROI Calculation**: The endpoint does not calculate ROI directly. You can calculate it on the frontend as: `(totalPnl / totalInvested) × 100`. Handle the case where `totalInvested` is 0.

---

## Related Endpoints

- **`GET /api/trade-history/user`**: Get detailed trade history for the user
- **`GET /api/trade-history/config/{configId}/stats`**: Get trade statistics for a specific configuration
- **`GET /api/trade-history/config/{configId}`**: Get trade history for a specific configuration
- **`GET /api/trade-history/failures`**: Get failure statistics grouped by category and reason
- **`GET /api/copytrading/config`**: Get all copy trading configurations

