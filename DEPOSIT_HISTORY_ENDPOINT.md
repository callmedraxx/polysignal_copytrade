# Deposit History Endpoint Documentation

## Endpoint

**`GET /api/deposit/history`**

This endpoint returns the complete on-chain deposit history for the authenticated user's proxy wallet. It **only tracks USDC.e** (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`), which matches the token used for balance checks. This ensures accurate tracking of how much the user has truly deposited on the platform.

The endpoint automatically syncs new deposits from the blockchain to the database for record keeping, using incremental scanning (only scans new blocks since last check). This means subsequent calls are faster and don't require full blockchain scans.

---

## Authentication

**Required:** Yes (JWT Bearer Token)

The endpoint requires authentication via the `Authorization` header:
```
Authorization: Bearer <JWT_TOKEN>
```

The JWT token is extracted from the request and used to identify the user's wallet address.

---

## Request

### URL
```
GET /api/deposit/history
```

### Query Parameters

**None** - The endpoint automatically syncs new deposits from the blockchain on every call.

### Example Request

```bash
curl -X GET 'https://poly.dev.api.polysignal.io/api/deposit/history' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Accept: application/json'
```

### Frontend Example (JavaScript/TypeScript)

```typescript
async function getDepositHistory(jwtToken: string) {
  const response = await fetch(
    'https://poly.dev.api.polysignal.io/api/deposit/history',
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Accept': 'application/json',
      },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch deposit history: ${response.statusText}`);
  }
  
  return await response.json();
}

// Usage - automatically syncs new deposits
const history = await getDepositHistory(userJwtToken);
```

---

## Response

### Success Response (200 OK)

```json
{
  "deposits": [
    {
      "depositId": "clx1234567890abcdef",           // Database ID (if exists)
      "transactionHash": "0xabc123...",            // On-chain transaction hash
      "status": "completed",                       // Status: pending, processing, bridging, completed, failed
      "sourceChain": "Polygon",                    // Source blockchain
      "tokenSymbol": "USDC.e",                     // Token symbol (always USDC.e)
      "amount": "100.5",                           // Deposit amount (formatted)
      "targetAmount": "100.5",                     // Final amount after bridging (usually same for Polygon deposits)
      "timestamp": "2024-01-15T10:30:00.000Z",    // Deposit timestamp
      "blockNumber": 12345678,                     // Block number
      "isHistorical": false,                       // true if originally scanned from blockchain, false if created during deposit flow
      "isBridgedUSDCE": true                      // Always true (only USDC.e is tracked)
    },
    {
      "depositId": "clx9876543210fedcba",
      "transactionHash": "0xdef456...",
      "status": "completed",
      "sourceChain": "Polygon",
      "tokenSymbol": "USDC.e",
      "amount": "50.0",
      "targetAmount": "50.0",
      "timestamp": "2024-01-10T08:15:00.000Z",
      "blockNumber": 12300000,
      "isHistorical": true,                       // Originally scanned from blockchain
      "isBridgedUSDCE": true
    }
  ],
  "stats": {
    "total": 2,                                   // Total number of deposits
    "completed": 2,                               // Number of completed deposits
    "pending": 0,                                 // Number of pending/processing deposits
    "totalAmount": "150.500000"                   // Total amount deposited (sum of targetAmount)
  }
}
```

### Error Responses

**401 Unauthorized:**
```json
{
  "error": "Authentication required"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Failed to get deposit history"
}
```

---

## Flow Explanation

### Step-by-Step Process

1. **Authentication & User Lookup**
   - Extracts JWT token from `Authorization` header
   - Validates token and extracts user's wallet address
   - Looks up user in database to get their proxy wallet address

2. **Automatic Deposit Sync**
   - **Always** syncs new deposits from blockchain to database:
     - Gets the highest block number from existing deposits (for incremental scanning)
     - Scans Polygon blockchain using Polygonscan API from last checked block
     - **Only checks USDC.e** (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`) - matches balance check token
     - Filters for incoming transfers to the user's proxy wallet
     - Creates database records for any new deposits found
     - Uses incremental scanning (only scans new blocks since last check) for efficiency

3. **Get Database Deposits**
   - Queries all deposit records from database for the user
   - Orders by creation date (newest first)
   - Extracts metadata (source chain, token info, block number, etc.)
   - All deposits are now in the database (no need to combine with blockchain scan)

4. **Calculate Statistics**
   - Counts total deposits
   - Counts completed deposits (status === "completed")
   - Counts pending deposits (status in ["pending", "processing", "bridging"])
   - Sums total amount from all deposits

5. **Format & Return**
   - Formats deposits for response
   - Sorts all deposits by timestamp (newest first)
   - Returns deposits array and statistics

### Key Benefits

- **Accurate Tracking**: Only tracks USDC.e, which matches the token used for balance checks
- **Complete Records**: All on-chain deposits are stored in database for easy analysis
- **Efficient Scanning**: Uses incremental scanning (only new blocks) for faster subsequent calls
- **No Duplicates**: Database ensures no duplicate deposit records

---

## How On-Chain Scanning Works

The endpoint uses the **Polygonscan API** to scan the blockchain for token transfers:

1. **Token Address Checked:**
   - **Only USDC.e**: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
   - This matches the token used for balance checks, ensuring accurate deposit tracking

2. **Incremental Scanning:**
   - Gets the highest block number from existing deposits in database
   - Only scans from last checked block to current block (not from block 0)
   - This makes subsequent calls much faster and reduces API usage
   - First call scans from block 0 (if no deposits exist)

3. **API Method:**
   - Uses `account` module with `tokentx` action
   - Filters by contract address (USDC.e address only)
   - Filters by recipient address (user's proxy wallet)
   - Scans from last checked block to current block

4. **Rate Limiting:**
   - Uses a rate-limited API client to respect Polygonscan API limits
   - Tracks daily API call usage
   - Logs rate limit statistics

5. **Data Processing:**
   - Filters for incoming transfers only (`to` address matches proxy wallet)
   - Converts raw token amounts using token decimals (6 for USDC.e)
   - Extracts transaction hash, block number, timestamp, and token info
   - **Always creates database records** for any deposits found

6. **Database Storage:**
   - All on-chain deposits are stored in the database
   - Next time, we only need to scan new blocks (incremental)
   - Complete deposit history is available from database without blockchain scan

---

## Key Features

### ✅ Accurate Deposit Tracking
- **Only tracks USDC.e** (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`)
- Matches the token used for balance checks
- Ensures accurate tracking of how much user has truly deposited

### ✅ Automatic Database Sync
- **Always syncs** new deposits from blockchain to database
- Creates database records for any on-chain deposits found
- Complete record keeping for easy analysis

### ✅ Incremental Scanning
- Only scans new blocks since last check (not from block 0)
- Much faster subsequent calls
- Reduces API usage and rate limit concerns
- First call scans from beginning if no deposits exist

### ✅ Complete History
- All deposits stored in database
- No need to scan blockchain every time
- Fast retrieval from database
- Includes deposits made before tracking was implemented

### ✅ Statistics
- Provides summary statistics (total, completed, pending, total amount)
- Useful for displaying deposit overview in UI
- Accurate totals based on USDC.e deposits only

---

## Frontend Integration Guide

### Automatic Syncing

The endpoint **automatically syncs** new deposits on every call, so you don't need to do anything special. The sync is incremental (only scans new blocks), so it's fast.

**Note:** The first call may take a few seconds if there are many historical deposits to sync. Subsequent calls are much faster as they only scan new blocks.

### Displaying Deposit History

```typescript
interface Deposit {
  depositId?: string;
  transactionHash: string;
  status: 'pending' | 'processing' | 'bridging' | 'completed' | 'failed';
  sourceChain?: string;
  tokenSymbol: string; // Always "USDC.e"
  amount: string;
  targetAmount?: string;
  timestamp: Date;
  blockNumber: number;
  isHistorical?: boolean;
  isBridgedUSDCE?: boolean; // Always true
}

interface DepositHistoryResponse {
  deposits: Deposit[];
  stats: {
    total: number;
    completed: number;
    pending: number;
    totalAmount: string;
  };
}

// Example: Display deposit history
function DepositHistoryComponent() {
  const [history, setHistory] = useState<DepositHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    async function loadHistory() {
      setLoading(true);
      try {
        const data = await getDepositHistory(jwtToken); // Automatically syncs
        setHistory(data);
      } catch (error) {
        console.error('Failed to load deposit history:', error);
      } finally {
        setLoading(false);
      }
    }
    loadHistory();
  }, []);
  
  if (loading) return <div>Loading deposit history...</div>;
  if (!history) return <div>No deposit history available</div>;
  
  return (
    <div>
      <h2>Deposit History</h2>
      <div className="stats">
        <p>Total: {history.stats.total}</p>
        <p>Completed: {history.stats.completed}</p>
        <p>Pending: {history.stats.pending}</p>
        <p>Total Amount: {history.stats.totalAmount} USDC</p>
      </div>
      <ul>
        {history.deposits.map((deposit) => (
          <li key={deposit.transactionHash}>
            <div>
              <strong>{deposit.tokenSymbol}</strong>: {deposit.amount}
            </div>
            <div>Status: {deposit.status}</div>
            <div>Date: {new Date(deposit.timestamp).toLocaleString()}</div>
            <div>
              <a 
                href={`https://polygonscan.com/tx/${deposit.transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Polygonscan
              </a>
            </div>
            {deposit.isHistorical && (
              <span className="badge">Historical</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Status Indicators

- **`completed`**: Deposit successfully received and processed
- **`pending`**: Deposit initiated but not yet confirmed
- **`processing`**: Deposit is being processed
- **`bridging`**: Deposit is being bridged from another chain
- **`failed`**: Deposit failed (rare)

### Transaction Links

Each deposit includes a `transactionHash` that can be used to link to Polygonscan:
```
https://polygonscan.com/tx/{transactionHash}
```

---

## Important Notes

1. **USDC.e Only**: This endpoint **only tracks USDC.e** (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`). This matches the token used for balance checks, ensuring accurate tracking of how much the user has truly deposited on the platform.

2. **Automatic Database Sync**: The endpoint **always syncs** new deposits from the blockchain to the database. This ensures complete record keeping and means subsequent calls are faster (incremental scanning).

3. **Incremental Scanning**: The system uses incremental scanning - it only scans new blocks since the last check. The first call may scan from block 0, but subsequent calls are much faster.

4. **Proxy Wallet**: All deposits are checked against the user's **proxy wallet** (Safe wallet), not their original wallet address.

5. **On-Chain Only**: This endpoint focuses on on-chain deposits. It does not include Onramper deposits (those are handled separately via the `/deposit/callback` endpoint).

6. **Complete Records**: All on-chain deposits are stored in the database. You don't need to scan the blockchain every time - the database contains the complete history.

7. **Rate Limiting**: The Polygonscan API has rate limits. The system uses a rate-limited client and incremental scanning to minimize API usage.

8. **Historical Deposits**: Deposits marked as `isHistorical: true` were originally scanned from the blockchain and synced to the database. They now have complete metadata stored.


