# Copy Trading Config Prepare Endpoint Documentation

## Endpoint

**`POST /api/copytrading/config/prepare`**

This endpoint validates a copy trading configuration and prepares it for creation. It does **NOT** create the configuration yet - that happens in the next step with `/api/copytrading/config/create-and-authorize`. This two-step flow ensures proper validation and authorization before creating the configuration.

**✅ RECOMMENDED:** This is the recommended endpoint for creating copy trading configurations, replacing the deprecated `/api/copytrading/config/create` endpoint.

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
POST /api/copytrading/config/prepare
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
  "marketCategories": ["politics", "sports"],
  "maxBuyTradesPerDay": 10,
  "durationDays": 30,
  "configName": "My Trading Campaign"
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
| `maxBuyTradesPerDay` | number \| null | Maximum number of buy trades per day (null = unlimited) |
| `durationDays` | number \| null | Number of days to copy trade for (null = unlimited) |
| `configName` | string \| null | User-defined name for this configuration/campaign |

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
curl -X POST 'https://poly.dev.api.polysignal.io/api/copytrading/config/prepare' \
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
interface PrepareConfigRequest {
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
}

interface PrepareConfigResponse {
  configData: PrepareConfigRequest;
  transaction: any | null;
  safeAddress: string;
}

async function prepareCopyTradingConfig(
  jwtToken: string,
  config: PrepareConfigRequest
): Promise<PrepareConfigResponse> {
  const response = await fetch(
    'https://poly.dev.api.polysignal.io/api/copytrading/config/prepare',
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
    throw new Error(error.error || 'Failed to prepare configuration');
  }
  
  return await response.json();
}

// Usage
try {
  const result = await prepareCopyTradingConfig(jwtToken, {
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
  
  // Save configData for next step
  const configData = result.configData;
  const safeAddress = result.safeAddress;
  
  // Note: transaction is null (authorization not required with derived wallets)
  // Proceed directly to create-and-authorize endpoint
} catch (error) {
  console.error('Error preparing configuration:', error);
}
```

---

## Response

### Success Response (200 OK)

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
  "transaction": null,
  "safeAddress": "0x1234567890abcdef1234567890abcdef12345678"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `configData` | object | Validated configuration data (same structure as request) |
| `transaction` | object \| null | Authorization transaction (currently `null` - not required with derived wallets) |
| `safeAddress` | string | User's proxy wallet (Safe wallet) address |

### Important Notes About Response

1. **Configuration NOT Created Yet**: This endpoint only validates and prepares the configuration. The configuration is **NOT** created in the database yet.

2. **Transaction is Null**: With the current implementation using derived wallets, `transaction` is always `null` because authorization is not required. Derived wallets handle all operations via the CLOB client.

3. **Use configData for Next Step**: The `configData` object should be saved and passed to the `/api/copytrading/config/create-and-authorize` endpoint in the next step.

4. **Safe Address**: The `safeAddress` is the user's proxy wallet address where trades will be executed.

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

```json
{
  "error": "You already have a copy trading configuration for this trader"
}
```

```json
{
  "error": "User does not have a proxy wallet. Please complete signup first."
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
  "error": "Failed to prepare configuration",
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
   - Returns error if trader not found or has no trading history

4. **Duplicate Check**
   - Checks if user already has a configuration for this trader
   - Returns error if duplicate exists (one config per trader per user)

5. **User Validation**
   - Checks if user exists
   - Checks if user has a proxy wallet (Safe wallet)
   - Returns error if proxy wallet doesn't exist

6. **Authorization Check**
   - Currently, authorization is not required (derived wallets handle everything)
   - `transaction` is set to `null`
   - This may change in future implementations

7. **Response**
   - Returns validated `configData` for use in next step
   - Returns `safeAddress` (user's proxy wallet)
   - Returns `transaction` (currently `null`)

---

## Data Limitations

### Trader Information

**⚠️ Trader stats are based on limited data, not full trading history:**

The trader verification performed by this endpoint has the following limitations:

1. **Activity Limit**: Trader verification fetches up to **1,000 most recent activities** from the Polymarket Data API
   - Statistics (`totalTrades`, `totalVolume`, etc.) are calculated from these 1,000 activities
   - If the trader has more than 1,000 trades, older trades are not included
   - The trader stats represent recent activity, not lifetime totals

2. **Profile Data**: User profile information (name, pseudonym, bio, profileImage) may not be available if not provided by the Polymarket API

3. **Validation Only**: This endpoint validates the trader but doesn't store the trader info yet. The trader info will be stored when the configuration is created in the next step.

---

## Next Steps

After successfully preparing the configuration:

1. **Save the configData**: Store the `configData` object from the response
2. **Call Create-and-Authorize**: Use the saved `configData` to call `POST /api/copytrading/config/create-and-authorize`
3. **Enable the Configuration**: After creation, call `POST /api/copytrading/config/{configId}/enable` to activate copy trading

---

## Use Cases

1. **Two-Step Configuration Creation**
   - Validate configuration before creating it
   - Ensure user has proxy wallet before proceeding
   - Prepare for authorization (if needed in future)

2. **Error Prevention**
   - Catch validation errors before creating the configuration
   - Verify trader exists before saving configuration
   - Check for duplicate configurations

3. **User Experience**
   - Show validation errors early in the flow
   - Allow users to fix issues before committing to configuration creation

---

## Important Notes

1. **Configuration Not Created**: This endpoint does **NOT** create the configuration. It only validates and prepares it.

2. **Two-Step Flow**: This is step 1 of a two-step process. You must call `/api/copytrading/config/create-and-authorize` next to actually create the configuration.

3. **Transaction is Null**: Currently, `transaction` is always `null` because authorization is not required with derived wallets. You can proceed directly to the create-and-authorize endpoint.

4. **One Config Per Trader**: Each user can only have one configuration per trader address. Attempting to prepare a duplicate will return an error.

5. **Trader Verification**: The endpoint automatically verifies the trader address before preparing the configuration. If the trader is not found or has no trading history, the preparation will fail.

6. **Proxy Wallet Required**: The user must have a proxy wallet (Safe wallet) before preparing a configuration. If not, the endpoint will return an error.

7. **Amount Type Validation**: The `amountType` must be exactly one of: `"fixed"`, `"percentage"`, or `"percentageOfOriginal"`. Other values will result in an error.

8. **Trade Type Requirement**: At least one of `copyBuyTrades` or `copySellTrades` must be `true`. You cannot disable both.

9. **Amount Filters**: All amount filter values (min/max buy/sell) must be non-negative. Negative values will result in an error.

---

## Related Endpoints

- **`POST /api/copytrading/trader/verify`**: Verify a trader address before preparing a configuration
- **`POST /api/copytrading/config/create-and-authorize`**: Create the configuration (step 2 of the flow)
- **`GET /api/copytrading/config`**: Get all configurations for the authenticated user
- **`POST /api/copytrading/config/{configId}/enable`**: Enable a configuration after creation

