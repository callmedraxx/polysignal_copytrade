# Copy Trading Config Get Endpoint Documentation

## Endpoint

**`GET /api/copytrading/config`**

This endpoint retrieves all copy trading configurations for the authenticated user. It returns an array of configuration objects containing settings, status, and trader information for each copy trading setup.

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
GET /api/copytrading/config
```

### Headers
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Request Body
None - This is a GET request with no body parameters.

### Example Request

```bash
curl -X GET 'https://poly.dev.api.polysignal.io/api/copytrading/config' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json'
```

### Frontend Example (JavaScript/TypeScript)

```typescript
async function getCopyTradingConfigs(token: string) {
  const response = await fetch(
    'https://poly.dev.api.polysignal.io/api/copytrading/config',
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
    throw new Error(error.error || 'Failed to get configurations');
  }
  
  return await response.json();
}

// Usage
try {
  const configs = await getCopyTradingConfigs(userToken);
  console.log('Copy trading configs:', configs);
} catch (error) {
  console.error('Error fetching configs:', error);
}
```

### React Hook Example

```typescript
import { useState, useEffect } from 'react';

interface CopyTradingConfig {
  id: string;
  targetTraderAddress: string;
  copyBuyTrades: boolean;
  copySellTrades: boolean;
  amountType: string;
  buyAmount: string;
  sellAmount: string;
  minBuyAmount?: string;
  maxBuyAmount?: string;
  minSellAmount?: string;
  maxSellAmount?: string;
  marketCategories?: string[];
  enabled: boolean;
  authorized: boolean;
  status: string;
  maxBuyTradesPerDay?: number;
  tradesCountToday: number;
  lastResetDate?: Date;
  durationDays?: number;
  startDate?: Date;
  traderInfo?: TraderInfo;
  createdAt: Date;
  updatedAt: Date;
}

function useCopyTradingConfigs(token: string) {
  const [configs, setConfigs] = useState<CopyTradingConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConfigs() {
      try {
        setLoading(true);
        const response = await fetch(
          'https://poly.dev.api.polysignal.io/api/copytrading/config',
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch configurations');
        }

        const data = await response.json();
        setConfigs(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchConfigs();
    }
  }, [token]);

  return { configs, loading, error };
}
```

---

## Response

### Success Response (200 OK)

The endpoint returns an array of copy trading configuration objects. If the user has no configurations, an empty array `[]` is returned.

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "targetTraderAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "copyBuyTrades": true,
    "copySellTrades": true,
    "amountType": "fixed",
    "buyAmount": "100.00",
    "sellAmount": "100.00",
    "minBuyAmount": "10.00",
    "maxBuyAmount": "500.00",
    "minSellAmount": "10.00",
    "maxSellAmount": "500.00",
    "marketCategories": ["politics", "sports"],
    "enabled": true,
    "authorized": true,
    "status": "active",
    "maxBuyTradesPerDay": 10,
    "tradesCountToday": 3,
    "lastResetDate": "2024-01-15T00:00:00.000Z",
    "durationDays": 30,
    "startDate": "2024-01-01T00:00:00.000Z",
    "traderInfo": {
      "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "isValid": true,
      "totalTrades": 150,
      "totalVolume": "50000.5",
      "activePositions": 12,
      "winRate": 65.5,
      "lastTradeTimestamp": 1704067200,
      "marketsTraded": [
        "0x1234567890abcdef1234567890abcdef12345678",
        "0xabcdef1234567890abcdef1234567890abcdef12"
      ],
      "buyTrades": 80,
      "sellTrades": 70,
      "userInfo": {
        "name": "John Doe",
        "pseudonym": "johndoe",
        "bio": "Professional trader with 5+ years experience",
        "profileImage": "https://polymarket.com/profile-image.jpg"
      }
    },
    "createdAt": "2024-01-01T10:00:00.000Z",
    "updatedAt": "2024-01-15T14:30:00.000Z"
  },
  {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "targetTraderAddress": "0x8ba1f109551bD432803012645Hac136c22C929e",
    "copyBuyTrades": true,
    "copySellTrades": false,
    "amountType": "percentage",
    "buyAmount": "50.00",
    "sellAmount": "0",
    "enabled": false,
    "authorized": false,
    "status": "active",
    "tradesCountToday": 0,
    "createdAt": "2024-01-10T08:00:00.000Z",
    "updatedAt": "2024-01-10T08:00:00.000Z"
  }
]
```

### Response Fields

The response is an array of `CopyTradingConfigResponse` objects. Each object contains the following fields:

#### Configuration Identification

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for the configuration (UUID) |
| `targetTraderAddress` | string | Ethereum address of the trader being copied (checksum format) |
| `createdAt` | Date (ISO string) | Timestamp when the configuration was created |
| `updatedAt` | Date (ISO string) | Timestamp when the configuration was last updated |

#### Trade Copying Settings

| Field | Type | Description |
|-------|------|-------------|
| `copyBuyTrades` | boolean | Whether to copy buy trades from the target trader |
| `copySellTrades` | boolean | Whether to copy sell trades from the target trader |

#### Amount Configuration

| Field | Type | Description |
|-------|------|-------------|
| `amountType` | string | Type of amount calculation. Possible values: `"fixed"`, `"percentage"`, `"percentageOfOriginal"` |
| `buyAmount` | string | Amount to use for buy trades (fixed amount in USDC, or percentage as string) |
| `sellAmount` | string | Amount to use for sell trades (fixed amount in USDC, or percentage as string) |
| `minBuyAmount` | string \| undefined | Minimum buy amount in USDC (optional) |
| `maxBuyAmount` | string \| undefined | Maximum buy amount in USDC (optional) |
| `minSellAmount` | string \| undefined | Minimum sell amount in USDC (optional) |
| `maxSellAmount` | string \| undefined | Maximum sell amount in USDC (optional) |

**Amount Type Explanations:**
- `"fixed"`: Use exact amounts specified in `buyAmount` and `sellAmount` (in USDC)
- `"percentage"`: Use percentage of available balance (0-100)
- `"percentageOfOriginal"`: Use percentage of the original trade amount (0-100)

#### Market Filtering

| Field | Type | Description |
|-------|------|-------------|
| `marketCategories` | string[] \| undefined | Array of market categories to filter trades. Only trades in these categories will be copied. If `undefined` or empty, all categories are allowed. |

#### Configuration Status

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Whether the configuration is currently enabled and actively copying trades |
| `authorized` | boolean | Whether the configuration has been authorized (required for enabling) |
| `status` | string | Current status of the configuration. Typically `"active"` for normal operation |

#### Trade Limits and Tracking

| Field | Type | Description |
|-------|------|-------------|
| `maxBuyTradesPerDay` | number \| undefined | Maximum number of buy trades allowed per day (optional) |
| `tradesCountToday` | number | Number of trades executed today (resets daily) |
| `lastResetDate` | Date (ISO string) \| undefined | Date when the daily trade count was last reset |
| `durationDays` | number \| undefined | Duration in days for the copy trading period (optional) |
| `startDate` | Date (ISO string) \| undefined | Start date for the copy trading period (optional) |

#### Trader Information

| Field | Type | Description |
|-------|------|-------------|
| `traderInfo` | TraderInfo \| undefined | Information about the target trader (optional, may not be present for older configurations) |

**TraderInfo Object Structure:**

```typescript
interface TraderInfo {
  address: string;                    // Trader's wallet address
  isValid: boolean;                   // Whether trader is valid
  totalTrades?: number;               // Total number of trades
  totalVolume?: string;               // Total trading volume in USDC
  activePositions?: number;           // Number of active positions
  winRate?: number;                   // Win rate percentage (0-100)
  lastTradeTimestamp?: number;        // Unix timestamp of last trade
  marketsTraded?: string[];           // Array of market IDs
  buyTrades?: number;                 // Number of buy trades
  sellTrades?: number;                // Number of sell trades
  userInfo?: {                        // User profile info (optional)
    name?: string;
    pseudonym?: string;
    bio?: string;
    profileImage?: string;
  };
}
```

**Note:** `traderInfo` may be `undefined` for configurations created before this field was added, or if trader verification failed.

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

#### 401 Unauthorized - Authentication Failed

```json
{
  "error": "Authentication required"
}
```

**Cause:** Token verification failed or user ID is missing from token.

#### 500 Internal Server Error

```json
{
  "error": "Failed to get configurations"
}
```

**Cause:** Server error occurred while fetching configurations. Check server logs for details.

---

## Response Ordering

Configurations are returned in **descending order by creation date** (most recent first). This means:
- The newest configuration appears first in the array
- The oldest configuration appears last in the array

---

## Use Cases

1. **Display User's Copy Trading Configurations**
   - Show all active copy trading setups in a dashboard
   - Display configuration status, trader info, and statistics

2. **Configuration Management**
   - List configurations for editing or deletion
   - Check which traders are being copied

3. **Status Monitoring**
   - Check if configurations are enabled/authorized
   - Monitor daily trade counts and limits

4. **Trader Information Display**
   - Show trader profile information (name, pseudonym, profile image)
   - Display trader statistics (total trades, volume, win rate)

---

## Frontend Implementation Guide

### TypeScript Interface

```typescript
interface CopyTradingConfig {
  id: string;
  targetTraderAddress: string;
  copyBuyTrades: boolean;
  copySellTrades: boolean;
  amountType: 'fixed' | 'percentage' | 'percentageOfOriginal';
  buyAmount: string;
  sellAmount: string;
  minBuyAmount?: string;
  maxBuyAmount?: string;
  minSellAmount?: string;
  maxSellAmount?: string;
  marketCategories?: string[];
  enabled: boolean;
  authorized: boolean;
  status: string;
  maxBuyTradesPerDay?: number;
  tradesCountToday: number;
  lastResetDate?: Date | string;
  durationDays?: number;
  startDate?: Date | string;
  traderInfo?: {
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
  };
  createdAt: Date | string;
  updatedAt: Date | string;
}
```

### React Component Example

```typescript
import React, { useEffect, useState } from 'react';

interface ConfigListProps {
  token: string;
}

function CopyTradingConfigList({ token }: ConfigListProps) {
  const [configs, setConfigs] = useState<CopyTradingConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConfigs() {
      try {
        setLoading(true);
        const response = await fetch(
          'https://poly.dev.api.polysignal.io/api/copytrading/config',
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
          throw new Error(errorData.error || 'Failed to fetch configurations');
        }

        const data = await response.json();
        setConfigs(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchConfigs();
  }, [token]);

  if (loading) return <div>Loading configurations...</div>;
  if (error) return <div>Error: {error}</div>;
  if (configs.length === 0) return <div>No copy trading configurations found.</div>;

  return (
    <div>
      <h2>Copy Trading Configurations</h2>
      {configs.map((config) => (
        <div key={config.id} className="config-card">
          <h3>
            {config.traderInfo?.userInfo?.name || 
             config.traderInfo?.userInfo?.pseudonym || 
             `${config.targetTraderAddress.slice(0, 6)}...${config.targetTraderAddress.slice(-4)}`}
          </h3>
          
          {config.traderInfo?.userInfo?.profileImage && (
            <img 
              src={config.traderInfo.userInfo.profileImage} 
              alt="Trader profile" 
            />
          )}

          <div className="status">
            <span className={config.enabled ? 'enabled' : 'disabled'}>
              {config.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <span className={config.authorized ? 'authorized' : 'unauthorized'}>
              {config.authorized ? 'Authorized' : 'Not Authorized'}
            </span>
          </div>

          <div className="settings">
            <p>Copy Buy Trades: {config.copyBuyTrades ? 'Yes' : 'No'}</p>
            <p>Copy Sell Trades: {config.copySellTrades ? 'Yes' : 'No'}</p>
            <p>Amount Type: {config.amountType}</p>
            <p>Buy Amount: {config.buyAmount}</p>
            <p>Sell Amount: {config.sellAmount}</p>
          </div>

          {config.traderInfo && (
            <div className="trader-stats">
              <p>Total Trades: {config.traderInfo.totalTrades || 0}</p>
              <p>Total Volume: {config.traderInfo.totalVolume || '0'} USDC</p>
              {config.traderInfo.winRate !== undefined && (
                <p>Win Rate: {config.traderInfo.winRate}%</p>
              )}
            </div>
          )}

          <div className="trade-count">
            <p>Trades Today: {config.tradesCountToday}</p>
            {config.maxBuyTradesPerDay && (
              <p>Max Per Day: {config.maxBuyTradesPerDay}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default CopyTradingConfigList;
```

### Handling Empty Results

When the user has no configurations, the endpoint returns an empty array `[]`. Always handle this case:

```typescript
if (configs.length === 0) {
  return (
    <div>
      <p>You don't have any copy trading configurations yet.</p>
      <button onClick={() => navigate('/create-config')}>
        Create Your First Configuration
      </button>
    </div>
  );
}
```

### Error Handling Best Practices

1. **Handle 401 Errors**: Redirect to login page or refresh token
2. **Handle Network Errors**: Show retry option
3. **Handle Empty Results**: Show helpful message to create first configuration
4. **Handle Missing traderInfo**: Gracefully handle cases where `traderInfo` is undefined

```typescript
function handleConfigFetchError(error: any, response: Response) {
  if (response.status === 401) {
    // Token expired or invalid - redirect to login
    window.location.href = '/login';
  } else if (response.status >= 500) {
    // Server error - show retry option
    return 'Server error. Please try again later.';
  } else {
    // Other errors
    return error.message || 'Failed to fetch configurations';
  }
}
```

---

## Important Notes

1. **Authentication Required**: This endpoint always requires JWT authentication. Ensure the token is valid and not expired.

2. **User-Scoped**: The endpoint only returns configurations belonging to the authenticated user. Users cannot access other users' configurations.

3. **Ordering**: Configurations are returned in descending order by creation date (newest first).

4. **Optional Fields**: Many fields are optional (`undefined`). Always check for existence before using them in the frontend.

5. **TraderInfo Availability**: The `traderInfo` field may be `undefined` for older configurations or if trader verification failed. Always handle this case.

6. **Date Fields**: Date fields (`createdAt`, `updatedAt`, `lastResetDate`, `startDate`) are returned as ISO 8601 strings. Parse them as needed in the frontend.

7. **Amount Strings**: All amount fields are returned as strings to preserve precision. Parse them as needed (e.g., `parseFloat()` or `BigNumber` for precise calculations).

8. **Market Categories**: The `marketCategories` array may be empty or `undefined`. An empty array means all categories are allowed.

9. **Status Values**: The `status` field typically contains `"active"` for normal configurations. Other values may be used for suspended or archived configurations.

10. **Daily Reset**: The `tradesCountToday` field resets daily. The `lastResetDate` indicates when the last reset occurred.

---

## Related Endpoints

- **`GET /api/copytrading/config/{configId}`**: Get a specific configuration by ID
- **`PUT /api/copytrading/config/{configId}`**: Update a configuration
- **`DELETE /api/copytrading/config/{configId}`**: Delete a configuration
- **`POST /api/copytrading/config/{configId}/enable`**: Enable a configuration
- **`POST /api/copytrading/config/{configId}/disable`**: Disable a configuration


