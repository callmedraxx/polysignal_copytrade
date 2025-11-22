# Copy Trading Config Create Endpoint Documentation

## Endpoint

**`POST /api/copytrading/config/create`**

This endpoint creates a copy trading configuration for the authenticated user. It allows users to set up automated copying of trades from a specific Polymarket trader.

**⚠️ DEPRECATED:** This endpoint is marked as deprecated. The recommended approach is to use `/api/copytrading/config/prepare` followed by `/api/copytrading/config/create-and-authorize` for proper authorization flow. However, this endpoint is still functional and may be used for backward compatibility.

---

## Authentication

**Required:** Yes (JWT Bearer Token)

The endpoint requires authentication via the `Authorization` header:
```
Authorization: Bearer <JWT_TOKEN>
```

The JWT token is extracted from the request and used to identify the user.

---

## Request

### URL
```
POST /api/copytrading/config/create
```

### Headers
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Request Body

```json
{
  "targetTraderAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "copyBuyTrades": true,
  "copySellTrades": true,
  "amountType": "fixed",
  "buyAmount": "10.0",
  "sellAmount": "10.0",
  "minBuyAmount": "5.0",
  "maxBuyAmount": "50.0",
  "minSellAmount": "5.0",
  "maxSellAmount": "50.0",
  "marketCategories": ["politics", "sports"]
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `targetTraderAddress` | string | Polymarket trader wallet address to copy trades from |
| `copyBuyTrades` | boolean | Whether to copy buy trades |
| `copySellTrades` | boolean | Whether to copy sell trades |
| `amountType` | string | Amount calculation type: `"fixed"`, `"percentage"`, or `"percentageOfOriginal"` |
| `buyAmount` | string | Amount to use for buy trades (USDC if fixed, percentage if percentage) |
| `sellAmount` | string | Amount to use for sell trades (USDC if fixed, percentage if percentage) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `minBuyAmount` | string | Minimum USDC amount of original buy trade to copy (filter) |
| `maxBuyAmount` | string | Maximum USDC amount of original buy trade to copy (filter) |
| `minSellAmount` | string | Minimum USDC amount of original sell trade to copy (filter) |
| `maxSellAmount` | string | Maximum USDC amount of original sell trade to copy (filter) |
| `marketCategories` | string[] | Array of market categories to copy (null/undefined = all categories) |

### Field Details

#### `amountType` Values

- **`"fixed"`**: Use a fixed USDC amount for each trade
  - `buyAmount` and `sellAmount` are in USDC (e.g., "10.0" = 10 USDC)
  - Must be positive numbers greater than 0
  
- **`"percentage"`**: Use a percentage of the user's available balance
  - `buyAmount` and `sellAmount` are percentages (e.g., "10.0" = 10% of balance)
  - Must be between 0 and 100
  
- **`"percentageOfOriginal"`**: Use a percentage of the original trade amount
  - `buyAmount` and `sellAmount` are percentages (e.g., "50.0" = 50% of original trade)
  - Must be between 0 and 100

#### Amount Filters

The `minBuyAmount`, `maxBuyAmount`, `minSellAmount`, and `maxSellAmount` fields act as filters:
- Only trades within the specified range will be copied
- If not specified, all trades (within other constraints) will be copied
- Values are in USDC

#### Market Categories

- If `marketCategories` is provided, only trades in those categories will be copied
- If `marketCategories` is `null` or `undefined`, trades from all categories will be copied
- Category names should match Polymarket category slugs

### Example Request

```bash
curl -X POST 'https://poly.dev.api.polysignal.io/api/copytrading/config/create' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "targetTraderAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "copyBuyTrades": true,
    "copySellTrades": true,
    "amountType": "fixed",
    "buyAmount": "10.0",
    "sellAmount": "10.0",
    "minBuyAmount": "5.0",
    "maxBuyAmount": "50.0",
    "marketCategories": ["politics", "sports"]
  }'
```

### Frontend Example (JavaScript/TypeScript)

```typescript
interface CreateConfigRequest {
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
}

async function createCopyTradingConfig(
  jwtToken: string,
  config: CreateConfigRequest
) {
  const response = await fetch(
    'https://poly.dev.api.polysignal.io/api/copytrading/config/create',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create configuration');
  }
  
  return await response.json();
}

// Usage
try {
  const config = await createCopyTradingConfig(jwtToken, {
    targetTraderAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    copyBuyTrades: true,
    copySellTrades: true,
    amountType: 'fixed',
    buyAmount: '10.0',
    sellAmount: '10.0',
    minBuyAmount: '5.0',
    maxBuyAmount: '50.0',
    marketCategories: ['politics', 'sports'],
  });
  console.log('Configuration created:', config);
} catch (error) {
  console.error('Error creating configuration:', error);
}
```

---

## Response

### Success Response (200 OK)

```json
{
  "id": "clx1234567890abcdef",
  "targetTraderAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "copyBuyTrades": true,
  "copySellTrades": true,
  "amountType": "fixed",
  "buyAmount": "10.0",
  "sellAmount": "10.0",
  "minBuyAmount": "5.0",
  "maxBuyAmount": "50.0",
  "minSellAmount": "5.0",
  "maxSellAmount": "50.0",
  "marketCategories": ["politics", "sports"],
  "enabled": false,
  "authorized": false,
  "status": "active",
  "maxBuyTradesPerDay": null,
  "tradesCountToday": 0,
  "lastResetDate": null,
  "durationDays": null,
  "startDate": null,
  "traderInfo": {
    "address": "0x742d35cc6634c0532925a3b844bc9e7595f0beb",
    "isValid": true,
    "totalTrades": 150,
    "totalVolume": "50000.5",
    "activePositions": 12,
    "lastTradeTimestamp": 1704067200,
    "marketsTraded": ["0x123...", "0x456..."],
    "buyTrades": 80,
    "sellTrades": 70,
    "userInfo": {
      "name": "John Doe",
      "pseudonym": "johndoe",
      "bio": "Professional trader",
      "profileImage": "https://..."
    }
  },
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique configuration ID |
| `targetTraderAddress` | string | Normalized trader wallet address (checksum format) |
| `copyBuyTrades` | boolean | Whether to copy buy trades |
| `copySellTrades` | boolean | Whether to copy sell trades |
| `amountType` | string | Amount calculation type: `"fixed"`, `"percentage"`, or `"percentageOfOriginal"` |
| `buyAmount` | string | Amount to use for buy trades |
| `sellAmount` | string | Amount to use for sell trades |
| `minBuyAmount` | string \| undefined | Minimum USDC amount filter for buy trades |
| `maxBuyAmount` | string \| undefined | Maximum USDC amount filter for buy trades |
| `minSellAmount` | string \| undefined | Minimum USDC amount filter for sell trades |
| `maxSellAmount` | string \| undefined | Maximum USDC amount filter for sell trades |
| `marketCategories` | string[] \| undefined | Array of market categories to copy |
| `enabled` | boolean | Whether the configuration is enabled (default: `false`) |
| `authorized` | boolean | Whether the configuration is authorized (default: `false`) |
| `status` | string | Configuration status: `"active"`, `"paused"`, or `"disabled"` (default: `"active"`) |
| `maxBuyTradesPerDay` | number \| undefined | Maximum number of buy trades per day (null = unlimited) |
| `tradesCountToday` | number | Current count of buy trades today (default: `0`) |
| `lastResetDate` | Date \| undefined | Last date when tradesCountToday was reset |
| `durationDays` | number \| undefined | Number of days to copy trade for (null = unlimited) |
| `startDate` | Date \| undefined | When copy trading started (for duration tracking) |
| `traderInfo` | object \| undefined | Trader information from verification (see Trader Verify endpoint) |
| `createdAt` | Date | Configuration creation timestamp |
| `updatedAt` | Date | Last update timestamp |

### Important Notes About Response

1. **Configuration is NOT Enabled by Default**: The `enabled` field is set to `false`. You must call the enable endpoint separately to activate copy trading.

2. **Configuration is NOT Authorized by Default**: The `authorized` field is set to `false`. Authorization may be required depending on your setup.

3. **Trader Info**: The `traderInfo` field contains the trader verification data fetched when the config was created. This is based on the most recent 1,000 activities from Polymarket (see Trader Verify endpoint documentation for data limitations).

4. **Status**: The configuration starts with `status: "active"` but is not enabled until you explicitly enable it.

---

### Error Responses

#### 400 Bad Request - Missing Required Fields

```json
{
  "error": "Missing required fields"
}
```

#### 400 Bad Request - Invalid Input

```json
{
  "error": "You already have a copy trading configuration for this trader"
}
```

```json
{
  "error": "Minimum buy amount cannot be negative"
}
```

```json
{
  "error": "Invalid trader address format"
}
```

```json
{
  "error": "At least one trade type (buy or sell) must be enabled"
}
```

```json
{
  "error": "Buy amount must be a positive number"
}
```

```json
{
  "error": "Buy percentage must be between 0 and 100"
}
```

```json
{
  "error": "Trader not found on Polymarket or has no trading history"
}
```

#### 401 Unauthorized

```json
{
  "error": "Authentication required"
}
```

#### 500 Internal Server Error

```json
{
  "error": "Failed to create configuration",
  "message": "Error details..."
}
```

---

## How It Works

### Step-by-Step Process

1. **Authentication**
   - Validates JWT token from `Authorization` header
   - Extracts user ID from token

2. **Request Validation**
   - Validates all required fields are present
   - Validates `amountType` is one of: `"fixed"`, `"percentage"`, or `"percentageOfOriginal"`
   - Validates trader address format (Ethereum address)
   - Validates at least one trade type is enabled (`copyBuyTrades` or `copySellTrades` must be `true`)
   - For `"fixed"` amount type: validates `buyAmount` and `sellAmount` are positive numbers > 0
   - For `"percentage"` or `"percentageOfOriginal"`: validates percentages are between 0 and 100
   - Validates amount filters are not negative (if provided)

3. **Trader Verification**
   - Verifies the `targetTraderAddress` using the Polymarket Data API
   - Fetches trader information (name, pseudonym, trading stats, etc.)
   - This data is based on the most recent 1,000 activities (see data limitations)

4. **Duplicate Check**
   - Checks if user already has a configuration for this trader
   - Returns error if duplicate exists (one config per trader per user)

5. **Configuration Creation**
   - Creates the configuration in the database
   - Sets `enabled: false` (must be enabled separately)
   - Sets `authorized: false` (authorization may be required)
   - Sets `status: "active"`
   - Stores trader info as JSON in `traderInfo` field

6. **Response**
   - Returns the created configuration with all fields
   - Includes trader information in the response

---

## Data Limitations

### Trader Information

**⚠️ Trader stats are based on limited data, not full trading history:**

The `traderInfo` field in the response contains trader verification data that is fetched when the configuration is created. This data has the following limitations:

1. **Activity Limit**: Trader verification fetches up to **1,000 most recent activities** from the Polymarket Data API
   - Statistics (`totalTrades`, `totalVolume`, etc.) are calculated from these 1,000 activities
   - If the trader has more than 1,000 trades, older trades are not included
   - The trader stats represent recent activity, not lifetime totals

2. **Profile Data**: User profile information (name, pseudonym, bio, profileImage) may be `undefined` if not provided by the Polymarket API

3. **Static Data**: The `traderInfo` is captured at configuration creation time and is not updated automatically. It represents a snapshot of the trader's activity at that moment.

### What This Means

- The trader statistics shown in the configuration are based on recent activity (last 1,000 trades)
- For very active traders, the stats may not represent their full trading history
- The trader profile information may not always be available
- The trader info is a snapshot and doesn't update automatically

---

## Use Cases

1. **Create Copy Trading Configuration**
   - Set up automated copying of trades from a specific trader
   - Configure trade filters (amount ranges, market categories)
   - Set copy preferences (buy/sell trades, amount types)

2. **Trader Discovery**
   - After verifying a trader, create a configuration to copy their trades
   - Store trader information for reference

3. **Configuration Management**
   - Create multiple configurations for different traders
   - Each user can have one configuration per trader

---

## Important Notes

1. **Deprecated Endpoint**: This endpoint is marked as deprecated. Consider using `/api/copytrading/config/prepare` and `/api/copytrading/config/create-and-authorize` instead for proper authorization flow.

2. **Configuration Not Enabled**: The configuration is created with `enabled: false`. You must call the enable endpoint separately to activate copy trading.

3. **One Config Per Trader**: Each user can only have one configuration per trader address. Attempting to create a duplicate will return an error.

4. **Trader Verification**: The endpoint automatically verifies the trader address before creating the configuration. If the trader is not found or has no trading history, the creation will fail.

5. **Amount Type Validation**: 
   - The `amountType` must be exactly one of: `"fixed"`, `"percentage"`, or `"percentageOfOriginal"`
   - For `"fixed"`: `buyAmount` and `sellAmount` must be positive numbers > 0
   - For `"percentage"` or `"percentageOfOriginal"`: `buyAmount` and `sellAmount` must be between 0 and 100

6. **Trade Type Requirement**: At least one of `copyBuyTrades` or `copySellTrades` must be `true`. You cannot disable both.

7. **Amount Filters**: All amount filter values (min/max buy/sell) must be non-negative. Negative values will result in an error.

8. **Market Categories**: If `marketCategories` is provided, it should be an array of category strings. If not provided or `null`, all categories will be copied.

9. **Trader Info Snapshot**: The `traderInfo` field contains a snapshot of trader data at configuration creation time. It is not updated automatically and may become stale over time.

10. **Trader Verification**: The endpoint automatically verifies the trader address before creating the configuration. If the trader is not found on Polymarket or has no trading history, the creation will fail with an error.

---

## Next Steps After Creation

After successfully creating a configuration:

1. **Enable the Configuration**: Call `POST /api/copytrading/config/{configId}/enable` to activate copy trading
2. **Authorize (if needed)**: Complete authorization if required by your setup
3. **Monitor Trades**: Use the trade history endpoints to monitor copied trades

---

## Related Endpoints

- **`POST /api/copytrading/trader/verify`**: Verify a trader address before creating a configuration
- **`GET /api/copytrading/config`**: Get all configurations for the authenticated user
- **`GET /api/copytrading/config/{configId}`**: Get a specific configuration
- **`POST /api/copytrading/config/{configId}/enable`**: Enable a configuration
- **`POST /api/copytrading/config/{configId}/disable`**: Disable a configuration
- **`PUT /api/copytrading/config/{configId}`**: Update a configuration
- **`DELETE /api/copytrading/config/{configId}`**: Delete a configuration
- **`POST /api/copytrading/config/prepare`**: (Recommended) Prepare configuration with authorization
- **`POST /api/copytrading/config/create-and-authorize`**: (Recommended) Create and authorize in one step

