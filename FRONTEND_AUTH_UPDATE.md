# Frontend Authentication Update

## Summary

The backend authentication flow has been optimized to handle existing users more efficiently. **The frontend flow remains the same** - no code changes are required. However, you should be aware of the improvements and how to handle the response.

## What Changed (Backend)

1. **Existing Users (with proxy wallet)**: 
   - Backend now skips nonce validation for users who already have a proxy wallet
   - Signature verification is still required
   - User data (including username) is immediately returned with a new JWT token
   - No proxy wallet creation or CLOB client setup (already done)

2. **New Users (or without proxy wallet)**:
   - Full authentication flow with nonce check
   - Proxy wallet creation if needed
   - CLOB client setup

## Frontend Flow (No Changes Required)

The frontend authentication flow remains **exactly the same**:

```typescript
async function signIn() {
  // 1. Connect wallet
  const address = await connectWallet();
  
  // 2. Request nonce (still required for SIWE message)
  const { nonce } = await fetch(`${API_BASE_URL}/auth/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  }).then(r => r.json());
  
  // 3. Create and sign SIWE message
  const message = new SiweMessage({
    domain: window.location.hostname,
    address,
    statement: 'Sign in with Ethereum to the app.',
    uri: window.location.origin,
    version: '1',
    chainId: 137,
    nonce, // Still needed for SIWE message format
    issuedAt: new Date().toISOString(),
  });
  const messageToSign = message.prepareMessage();
  const signature = await signer.signMessage(messageToSign);
  
  // 4. Verify with backend
  const { user, token } = await fetch(`${API_BASE_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: messageToSign, signature }),
  }).then(r => r.json());
  
  // 5. Store token and user data
  storeToken(token);
  storeUser(user);
}
```

## Important Notes

### 1. Nonce is Still Required

Even though the backend skips nonce validation for existing users, **you still need to request a nonce** because:
- The SIWE message format requires a nonce field
- New users still need nonce validation
- The backend uses `upsert` which ensures the user exists in the database

### 2. User Data Response

The response from `/auth/verify` will always include complete user data:

```typescript
{
  user: {
    id: string;
    address: string;
    username?: string;        // ✅ Will be present if user has set a username
    proxyWallet?: string;     // ✅ Will be present for existing users
  },
  token: string;
}
```

### 3. Handling Username

Check if the user has a username to show/hide the username setup UI:

```typescript
// After authentication
if (!user.username) {
  // Show username setup UI
  showUsernameSetup();
} else {
  // User already has username, proceed to main app
  navigateToMainApp();
}
```

### 4. Existing Users Will Be Faster

- **Existing users**: Authentication is faster (no proxy wallet creation)
- **New users**: Full flow (proxy wallet creation may take a few seconds)

You can show different loading states:

```typescript
const { user, token } = await authenticate();

if (user.proxyWallet) {
  // Existing user - fast authentication
  console.log('Welcome back!');
} else {
  // New user - proxy wallet was just created
  console.log('Welcome! Setting up your account...');
}
```

## Benefits

1. **No Code Changes**: Your existing frontend code will work without modifications
2. **Faster Authentication**: Existing users authenticate immediately
3. **Data Persistence**: Username and other user data persist correctly
4. **Better UX**: Users don't see "new user" flow every time they connect

## Error Handling

Error handling remains the same:

```typescript
try {
  const { user, token } = await authenticate();
  // Success
} catch (error) {
  if (error.message.includes('User not found or no nonce set')) {
    // User needs to request a new nonce first
    // This shouldn't happen in normal flow, but handle it gracefully
  } else if (error.message.includes('Invalid nonce')) {
    // Nonce mismatch - request a new nonce and retry
  } else {
    // Other authentication errors
  }
}
```

## Testing

To test the new flow:

1. **First-time user**: Connect wallet → Should see proxy wallet creation
2. **Returning user**: Connect same wallet → Should authenticate immediately with existing data
3. **Username persistence**: Set username → Disconnect → Reconnect → Username should still be there

## Summary

✅ **No frontend code changes required**  
✅ **Same authentication flow**  
✅ **Better performance for existing users**  
✅ **User data persists correctly**  
✅ **Just handle the response properly (check for username, proxyWallet, etc.)**

