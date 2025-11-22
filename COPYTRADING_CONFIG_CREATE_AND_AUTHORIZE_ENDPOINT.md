# Copy Trading Config Create and Authorize Endpoint Documentation

## Endpoint

**`POST /api/copytrading/config/create-and-authorize`**

This endpoint creates the copy trading configuration and marks it as authorized. It is the second step in the recommended two-step flow, called after `/api/copytrading/config/prepare`. The configuration is created in the database and automatically marked as authorized (since derived wallets handle all operations).

**✅ RECOMMENDED:** This is the recommended endpoint for creating copy trading configurations, used in conjunction with `/api/copytrading/config/prepare`.

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
POST /api/copytrading/config/create-and-authorize
```

### Headers
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Request Body

```json
{
  "configData": {
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
    "maxBuyTradesPerDay": 10,
    "durationDays": 30,
    "configName": "My Trading Campaign"
  },
  "signedTransaction": null
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `configData` | object | Configuration data from `/api/copytrading/config/prepare` response |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `signedTransaction` | object \| null | Signed transaction (currently not required, can be `null`) |

### Field Details

#### `configData` Object

The `configData` object should be the exact same object returned from the `/api/copytrading/config/prepare` endpoint. It contains:

- `targetTraderAddress` (string): Trader wallet address
- `copyBuyTrades` (boolean): Whether to copy buy trades
- `copySellTrades` (boolean): Whether to copy sell trades
- `amountType` (string): `"fixed"`, `"percentage"`, or `"percentageOfOriginal"`
- `buyAmount` (string): Amount for buy trades
- `sellAmount` (string): Amount for sell trades
- `minBuyAmount` (string, optional): Minimum buy amount filter
- `maxBuyAmount` (string, optional): Maximum buy amount filter
- `minSellAmount` (string, optional): Minimum sell amount filter
- `maxSellAmount` (string, optional): Maximum sell amount filter
- `marketCategories` (string[], optional): Market categories to copy
- `maxBuyTradesPerDay` (number | null, optional): Maximum number of buy trades per day (null = unlimited)
- `durationDays` (number | null, optional): Number of days to copy trade for (null = unlimited)
- `configName` (string | null, optional): User-defined name for this configuration/campaign

#### `signedTransaction`

Currently, `signedTransaction` is not required and can be `null`. With derived wallets, authorization is handled automatically via the CLOB client.

### Example Request

```bash
curl -X POST 'https://poly.dev.api.polysignal.io/api/copytrading/config/create-and-authorize' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "configData": {
      "targetTraderAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "copyBuyTrades": true,
      "copySellTrades": true,
      "amountType": "fixed",
      "buyAmount": "10.0",
      "sellAmount": "10.0",
      "minBuyAmount": "5.0",
      "maxBuyAmount": "50.0",
      "marketCategories": ["politics", "sports"]
    },
    "signedTransaction": null
  }'
```

### Frontend Example (JavaScript/TypeScript)

```typescript
interface CreateAndAuthorizeRequest {
  configData: {
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
    maxBuyTradesPerDay?: number | null;
    durationDays?: number | null;
    configName?: string | null;
  };
  signedTransaction?: any | null;
}

interface CreateAndAuthorizeResponse {
  config: {
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
    traderInfo?: any;
    createdAt: Date;
    updatedAt: Date;
  };
  safeTxHash: string;
  authorizationStatus?: string;
  message?: string;
}

async function createAndAuthorizeConfig(
  jwtToken: string,
  configData: CreateAndAuthorizeRequest['configData']
): Promise<CreateAndAuthorizeResponse> {
  const response = await fetch(
    'https://poly.dev.api.polysignal.io/api/copytrading/config/create-and-authorize',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        configData,
        signedTransaction: null, // Not required with derived wallets
      }),
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create configuration');
  }
  
  return await response.json();
}

// Usage - after calling prepare endpoint
async function createConfigFlow(jwtToken: string) {
  // Step 1: Prepare configuration
  const prepareResult = await prepareCopyTradingConfig(jwtToken, {
    targetTraderAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    copyBuyTrades: true,
    copySellTrades: true,
    amountType: 'fixed',
    buyAmount: '10.0',
    sellAmount: '10.0',
    maxBuyTradesPerDay: 10,
    durationDays: 30,
    configName: 'My Trading Campaign',
  });
  
  // Step 2: Create and authorize
  const createResult = await createAndAuthorizeConfig(
    jwtToken,
    prepareResult.configData
  );
  
  console.log('Configuration created:', createResult.config);
  // Configuration is created and authorized, but not enabled yet
}
```

---

## Response

### Success Response (200 OK)

```json
{
  "config": {
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
    "authorized": true,
    "status": "active",
    "maxBuyTradesPerDay": 10,
    "tradesCountToday": 0,
    "lastResetDate": "2024-01-15T10:30:00.000Z",
    "durationDays": 30,
    "startDate": "2024-01-15T10:30:00.000Z",
    "configName": "My Trading Campaign",
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
  },
  "safeTxHash": "not_required",
  "authorizationStatus": "not_required",
  "message": "Authorization not required. Derived wallets handle all operations via CLOB client."
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `config` | object | Created configuration object (see Configuration Object below) |
| `safeTxHash` | string | Safe transaction hash (currently `"not_required"`) |
| `authorizationStatus` | string | Authorization status (currently `"not_required"`) |
| `message` | string | Informational message about authorization |

#### Configuration Object

The `config` object contains all the configuration details:

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
| `authorized` | boolean | Whether the configuration is authorized (default: `true` after creation) |
| `status` | string | Configuration status: `"active"`, `"paused"`, or `"disabled"` (default: `"active"`) |
| `maxBuyTradesPerDay` | number \| undefined | Maximum number of buy trades per day (null = unlimited) |
| `tradesCountToday` | number | Current count of buy trades today (default: `0`) |
| `lastResetDate` | Date \| undefined | Last date when tradesCountToday was reset |
| `durationDays` | number \| undefined | Number of days to copy trade for (null = unlimited) |
| `startDate` | Date \| undefined | When copy trading started (for duration tracking) |
| `configName` | string \| undefined | User-defined name for this configuration/campaign |
| `traderInfo` | object \| undefined | Trader information from verification (see Trader Verify endpoint) |
| `createdAt` | Date | Configuration creation timestamp |
| `updatedAt` | Date | Last update timestamp |

### Important Notes About Response

1. **Configuration Created**: The configuration is now created in the database and can be retrieved using the configuration ID.

2. **Authorized by Default**: The configuration is automatically marked as `authorized: true` because derived wallets handle all operations via the CLOB client.

3. **Not Enabled Yet**: The configuration is created with `enabled: false`. You must call the enable endpoint separately to activate copy trading.

4. **Trader Info Included**: The `traderInfo` field contains the trader verification data fetched during preparation. This is based on the most recent 1,000 activities from Polymarket (see data limitations).

5. **Authorization Status**: The `authorizationStatus` and `message` fields indicate that authorization is not required with the current implementation.

---

### Error Responses

#### 400 Bad Request - Missing Configuration Data

```json
{
  "error": "Configuration data is required"
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
  "error": "Trader not found on Polymarket or has no trading history"
}
```

#### 401 Unauthorized

```json
{
  "error": "Authentication required"
}
```

#### 404 Not Found

```json
{
  "error": "User not found"
}
```

```json
{
  "error": "User does not have a proxy wallet"
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
   - Validates that `configData` is provided
   - Validates user exists
   - Validates user has a proxy wallet (Safe wallet)

3. **Configuration Creation**
   - Calls `createCopyTradingConfig()` with the provided `configData`
   - This performs all the same validations as the prepare endpoint:
     - Validates trader address format
     - Verifies trader exists on Polymarket
     - Validates amount types and values
     - Checks for duplicate configurations
   - Creates the configuration in the database
   - Fetches and stores trader information

4. **Authorization**
   - Automatically marks the configuration as `authorized: true`
   - Sets `safeTxHash` to `"not_required"`
   - Sets `authorizationStatus` to `"not_required"`
   - This is because derived wallets handle all operations via the CLOB client

5. **Response**
   - Returns the created configuration with all fields
   - Returns authorization status information

---

## Data Limitations

### Trader Information

**⚠️ Trader stats are based on limited data, not full trading history:**

The `traderInfo` field in the response contains trader verification data that has the following limitations:

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

1. **Complete Configuration Creation**
   - Finalize the configuration creation process after preparation
   - Create the configuration in the database
   - Automatically authorize the configuration

2. **Two-Step Flow**
   - Part of the recommended two-step configuration creation flow
   - Ensures proper validation before creation
   - Provides better error handling and user experience

3. **Configuration Management**
   - Create configurations that are ready to be enabled
   - Store trader information for reference
   - Track configuration creation timestamps

---

## Important Notes

1. **Two-Step Flow**: This is step 2 of a two-step process. You should call `/api/copytrading/config/prepare` first to validate the configuration.

2. **Configuration Created**: Unlike the prepare endpoint, this endpoint actually creates the configuration in the database.

3. **Authorized by Default**: The configuration is automatically marked as `authorized: true` because derived wallets handle all operations.

4. **Not Enabled**: The configuration is created with `enabled: false`. You must call `POST /api/copytrading/config/{configId}/enable` separately to activate copy trading.

5. **One Config Per Trader**: Each user can only have one configuration per trader address. Attempting to create a duplicate will return an error.

6. **Trader Verification**: The endpoint re-verifies the trader address during creation. If the trader is not found or has no trading history, the creation will fail.

7. **ConfigData Validation**: The `configData` should be the exact same object returned from the prepare endpoint. Any modifications may cause validation errors.

8. **Signed Transaction**: Currently, `signedTransaction` is not required and can be `null`. This may change in future implementations.

9. **Proxy Wallet Required**: The user must have a proxy wallet (Safe wallet) before creating a configuration. If not, the endpoint will return an error.

---

## Next Steps After Creation

After successfully creating a configuration:

1. **Enable the Configuration**: Call `POST /api/copytrading/config/{configId}/enable` to activate copy trading
2. **Monitor Configuration**: Use `GET /api/copytrading/config/{configId}` to check configuration status
3. **View Trade History**: Use trade history endpoints to monitor copied trades

---

## Complete Flow Example

```typescript
// Complete two-step flow
async function createCopyTradingConfigComplete(
  jwtToken: string,
  configInput: {
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
) {
  try {
    // Step 1: Prepare configuration
    console.log('Step 1: Preparing configuration...');
    const prepareResult = await prepareCopyTradingConfig(jwtToken, configInput);
    console.log('Configuration prepared:', prepareResult);
    
    // Step 2: Create and authorize
    console.log('Step 2: Creating and authorizing configuration...');
    const createResult = await createAndAuthorizeConfig(
      jwtToken,
      prepareResult.configData
    );
    console.log('Configuration created:', createResult.config);
    
    // Step 3: Enable configuration (optional)
    console.log('Step 3: Enabling configuration...');
    await enableCopyTradingConfig(jwtToken, createResult.config.id);
    console.log('Configuration enabled!');
    
    return createResult.config;
  } catch (error) {
    console.error('Error in configuration flow:', error);
    throw error;
  }
}
```

---

## Related Endpoints

- **`POST /api/copytrading/config/prepare`**: Prepare configuration (step 1 of the flow)
- **`POST /api/copytrading/trader/verify`**: Verify a trader address before creating a configuration
- **`GET /api/copytrading/config`**: Get all configurations for the authenticated user
- **`GET /api/copytrading/config/{configId}`**: Get a specific configuration
- **`POST /api/copytrading/config/{configId}/enable`**: Enable a configuration
- **`POST /api/copytrading/config/{configId}/disable`**: Disable a configuration
- **`PUT /api/copytrading/config/{configId}`**: Update a configuration
- **`DELETE /api/copytrading/config/{configId}`**: Delete a configuration

