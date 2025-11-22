# Trader Verify Endpoint Documentation

## Endpoint

**`POST /api/copytrading/trader/verify`**

This endpoint verifies a Polymarket trader address and returns comprehensive trader information including trading statistics, profile data, and recent activity. It uses the Polymarket Data API to fetch trader activity and positions.

---

## Authentication

**Required:** No (currently public endpoint)

**Note:** While authentication is not currently required, JWT authentication may be added in the future for rate limiting and security purposes. The endpoint accepts requests without authentication tokens.

---

## Request

### URL
```
POST /api/copytrading/trader/verify
```

### Headers
```
Content-Type: application/json
```

### Request Body

```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Required Fields:**
- `address` (string): Polymarket trader wallet address in Ethereum format (0x...)

### Example Request

```bash
curl -X POST 'https://poly.dev.api.polysignal.io/api/copytrading/trader/verify' \
  -H 'Content-Type: application/json' \
  -d '{
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
  }'
```

### Frontend Example (JavaScript/TypeScript)

```typescript
async function verifyTrader(address: string) {
  const response = await fetch(
    'https://poly.dev.api.polysignal.io/api/copytrading/trader/verify',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: address,
      }),
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to verify trader');
  }
  
  return await response.json();
}

// Usage
try {
  const traderInfo = await verifyTrader('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
  console.log('Trader verified:', traderInfo);
} catch (error) {
  console.error('Error verifying trader:', error);
}
```

---

## Response

### Success Response (200 OK)

```json
{
  "address": "0x742d35cc6634c0532925a3b844bc9e7595f0beb",
  "isValid": true,
  "totalTrades": 150,
  "totalVolume": "50000.5",
  "activePositions": 12,
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
  },
  "stats": {
    "totalTrades": 150,
    "buyTrades": 80,
    "sellTrades": 70,
    "totalVolume": "50000.5",
    "averageTradeSize": "333.34",
    "mostTradedCategories": [],
    "recentTrades": [
      {
        "id": "0xabc123...",
        "type": "BUY",
        "amount": "100.5",
        "market": "Will it rain tomorrow?",
        "category": "weather",
        "timestamp": 1704067200,
        "transactionHash": "0xdef456..."
      },
      {
        "id": "0x789xyz...",
        "type": "SELL",
        "amount": "50.25",
        "market": "Election outcome prediction",
        "category": "politics",
        "timestamp": 1703980800,
        "transactionHash": "0x456abc..."
      }
    ]
  }
}
```

### Response Fields

#### Basic Trader Information

| Field | Type | Description |
|-------|------|-------------|
| `address` | string | Normalized trader wallet address (checksum format) |
| `isValid` | boolean | Whether the address is a valid Polymarket trader with trading history |
| `totalTrades` | number | Total number of trades executed by the trader |
| `totalVolume` | string | Total trading volume in USDC (formatted string) |
| `activePositions` | number | Number of currently active positions |
| `lastTradeTimestamp` | number | Unix timestamp (seconds) of the most recent trade |
| `marketsTraded` | string[] | Array of market IDs (condition IDs) the trader has traded |
| `buyTrades` | number | Number of buy trades |
| `sellTrades` | number | Number of sell trades |

#### User Profile Information (Optional)

| Field | Type | Description |
|-------|------|-------------|
| `userInfo` | object \| undefined | User profile information (if available from Polymarket API) |
| `userInfo.name` | string \| undefined | Trader's display name |
| `userInfo.pseudonym` | string \| undefined | Trader's username/pseudonym |
| `userInfo.bio` | string \| undefined | Trader's bio/description |
| `userInfo.profileImage` | string \| undefined | URL to trader's profile image |

**Note:** `userInfo` is only included if the Polymarket API provides profile information in the activity data. It may be `undefined` if not available.

#### Additional Statistics

| Field | Type | Description |
|-------|------|-------------|
| `stats` | object | Additional detailed statistics (if available) |
| `stats.totalTrades` | number | Total number of trades |
| `stats.buyTrades` | number | Number of buy trades |
| `stats.sellTrades` | number | Number of sell trades |
| `stats.totalVolume` | string | Total trading volume in USDC |
| `stats.averageTradeSize` | string | Average trade size in USDC |
| `stats.mostTradedCategories` | string[] | Most traded categories (currently empty, requires market data) |
| `stats.recentTrades` | array | Array of up to 10 most recent trades |
| `stats.recentTrades[].id` | string | Trade ID or condition ID |
| `stats.recentTrades[].type` | string | Trade type: "BUY" or "SELL" |
| `stats.recentTrades[].amount` | string | Trade amount in USDC |
| `stats.recentTrades[].market` | string | Market title/question |
| `stats.recentTrades[].category` | string | Event category/slug |
| `stats.recentTrades[].timestamp` | number | Unix timestamp (seconds) |
| `stats.recentTrades[].transactionHash` | string | Blockchain transaction hash |

---

### Error Responses

#### 400 Bad Request - Missing Address

```json
{
  "error": "Address is required"
}
```

#### 400 Bad Request - Invalid Address Format

```json
{
  "error": "Invalid Ethereum address format"
}
```

#### 404 Not Found - Trader Not Found

```json
{
  "error": "Trader not found on Polymarket or has no trading history",
  "traderInfo": {
    "address": "0x742d35cc6634c0532925a3b844bc9e7595f0beb",
    "isValid": false,
    "totalTrades": 0,
    "totalVolume": "0",
    "activePositions": 0
  }
}
```

#### 500 Internal Server Error

```json
{
  "error": "Failed to verify trader",
  "message": "Error details..."
}
```

---

## Data Limitations

### Important Notes About Data Scope

**⚠️ Statistics are based on limited data, not full trading history:**

1. **Activity Limit**: The endpoint fetches up to **1,000 most recent activities** from the Polymarket Data API (`limit=1000`). This means:
   - Statistics (`totalTrades`, `totalVolume`, etc.) are calculated from the most recent 1,000 activities
   - If a trader has more than 1,000 trades, older trades are not included in the calculations
   - The `totalTrades` count represents trades within the fetched limit, not the trader's lifetime total

2. **Positions Limit**: Active positions are fetched with a limit of **1,000 positions** (`limit=1000`)

3. **Recent Trades**: The `stats.recentTrades` array contains up to **10 most recent trades** from the fetched activities

4. **Market Categories**: The `mostTradedCategories` field is currently empty as it requires additional market data that is not provided by the activity endpoint

### What This Means for Frontend Display

When displaying trader information to users:

- **Show a disclaimer** that statistics are based on recent activity (last 1,000 trades)
- **Indicate data scope** in the UI (e.g., "Based on last 1,000 trades")
- **Handle cases** where `userInfo` might be `undefined`
- **Note that** `totalTrades` and `totalVolume` may not represent lifetime totals for very active traders

### Example Frontend Display

```typescript
interface TraderInfo {
  address: string;
  isValid: boolean;
  totalTrades: number;
  totalVolume: string;
  activePositions: number;
  lastTradeTimestamp?: number;
  marketsTraded: string[];
  buyTrades: number;
  sellTrades: number;
  userInfo?: {
    name?: string;
    pseudonym?: string;
    bio?: string;
    profileImage?: string;
  };
  stats?: {
    totalTrades: number;
    buyTrades: number;
    sellTrades: number;
    totalVolume: string;
    averageTradeSize: string;
    mostTradedCategories: string[];
    recentTrades: Array<{
      id: string;
      type: string;
      amount: string;
      market: string;
      category: string;
      timestamp: number;
      transactionHash: string;
    }>;
  };
}

function TraderProfile({ traderInfo }: { traderInfo: TraderInfo }) {
  return (
    <div>
      {/* Display name or pseudonym */}
      <h2>
        {traderInfo.userInfo?.name || 
         traderInfo.userInfo?.pseudonym || 
         `${traderInfo.address.slice(0, 6)}...${traderInfo.address.slice(-4)}`}
      </h2>
      
      {/* Profile image if available */}
      {traderInfo.userInfo?.profileImage && (
        <img 
          src={traderInfo.userInfo.profileImage} 
          alt="Profile" 
        />
      )}
      
      {/* Bio if available */}
      {traderInfo.userInfo?.bio && (
        <p>{traderInfo.userInfo.bio}</p>
      )}
      
      {/* Statistics with disclaimer */}
      <div className="stats">
        <div>
          <strong>Total Trades:</strong> {traderInfo.totalTrades}
          <small> (based on last 1,000 activities)</small>
        </div>
        <div>
          <strong>Total Volume:</strong> {traderInfo.totalVolume} USDC
          <small> (based on last 1,000 activities)</small>
        </div>
        <div>
          <strong>Active Positions:</strong> {traderInfo.activePositions}
        </div>
        <div>
          <strong>Buy Trades:</strong> {traderInfo.buyTrades}
        </div>
        <div>
          <strong>Sell Trades:</strong> {traderInfo.sellTrades}
        </div>
        {traderInfo.stats?.averageTradeSize && (
          <div>
            <strong>Average Trade Size:</strong> {traderInfo.stats.averageTradeSize} USDC
          </div>
        )}
      </div>
      
      {/* Recent trades */}
      {traderInfo.stats?.recentTrades && traderInfo.stats.recentTrades.length > 0 && (
        <div>
          <h3>Recent Trades (Last 10)</h3>
          <ul>
            {traderInfo.stats.recentTrades.map((trade) => (
              <li key={trade.id}>
                {trade.type}: {trade.amount} USDC - {trade.market}
                <br />
                <small>{new Date(trade.timestamp * 1000).toLocaleString()}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

## How It Works

### Step-by-Step Process

1. **Request Validation**
   - Validates that `address` is provided and is a string
   - Validates Ethereum address format using `isValidAddress()`

2. **Address Normalization**
   - Converts address to checksum format (EIP-55)

3. **Fetch Activity Data**
   - Calls Polymarket Data API: `/activity?user={address}&limit=1000`
   - Fetches up to 1,000 most recent activities

4. **Fetch Positions Data**
   - Calls Polymarket Data API: `/positions?user={address}&limit=1000`
   - Fetches up to 1,000 positions (may fail silently)

5. **Process Activity Data**
   - Filters activities for trade type (`type === 'TRADE'`)
   - Calculates total volume from `usdcSize` fields
   - Counts buy vs sell trades
   - Extracts unique market IDs
   - Gets last trade timestamp
   - Extracts user profile info from first activity (if available)

6. **Calculate Statistics**
   - Counts active positions (from positions endpoint or activities)
   - Calculates average trade size
   - Prepares recent trades list (up to 10)

7. **Return Response**
   - Combines basic trader info with additional stats
   - Returns 404 if trader has no trading history
   - Returns basic info even if stats fail to fetch

---

## Use Cases

1. **Trader Verification Before Copy Trading**
   - Verify a trader address before creating a copy trading configuration
   - Display trader statistics to help users make informed decisions

2. **Trader Profile Display**
   - Show trader name, pseudonym, and profile image
   - Display trading statistics and recent activity

3. **Trader Discovery**
   - Allow users to search and verify traders
   - Show trader performance metrics

4. **Copy Trading Setup**
   - Validate that a trader has sufficient trading history
   - Show trader's trading style (buy vs sell ratio)

---

## Important Notes

1. **No Authentication Required**: Currently, this endpoint does not require JWT authentication. However, authentication may be added in the future for rate limiting and security.

2. **Data Limitations**: Statistics are based on the most recent 1,000 activities, not full trading history. Always display this limitation to users.

3. **Optional Profile Data**: `userInfo` may be `undefined` if the Polymarket API doesn't provide profile information. Always handle this case in the frontend.

4. **Stats May Be Partial**: If `getTraderStats()` fails, the endpoint still returns basic trader info without the `stats` object.

5. **Rate Limiting**: The endpoint makes multiple API calls to Polymarket Data API. Consider implementing rate limiting if authentication is added.

6. **Address Format**: The endpoint accepts addresses in any case but returns them in checksum format (EIP-55).

---

## Related Endpoints

- **`POST /api/copytrading/config/create`**: Create a copy trading configuration for a verified trader
- **`GET /api/copytrading/config`**: Get user's copy trading configurations
- **`GET /api/copytrading/config/{configId}`**: Get specific copy trading configuration

