# Frontend Authentication Flow Guide

This guide provides complete documentation for implementing the authentication flow in the frontend application. The authentication system uses **SIWE (Sign-In with Ethereum)** with JWT tokens for session management.

## Table of Contents

1. [Overview](#overview)
2. [Network Configuration](#network-configuration)
3. [Authentication Flow](#authentication-flow)
4. [API Endpoints](#api-endpoints)
5. [JWT Token Storage (Security Best Practices)](#jwt-token-storage-security-best-practices)
6. [Complete Implementation Flow](#complete-implementation-flow)
7. [Error Handling](#error-handling)
8. [Token Expiration & Reconnection](#token-expiration--reconnection)

---

## Overview

The authentication system uses:
- **SIWE (Sign-In with Ethereum)** for wallet-based authentication
- **JWT tokens** for session management (7-day expiration)
- **Polygon network** (Chain ID: 137) for wallet connections
- **Username system** (optional, can be set after signup)

**Important**: JWT tokens should **NEVER** be stored in `localStorage` due to XSS vulnerabilities. See [JWT Token Storage](#jwt-token-storage-security-best-practices) section for secure alternatives.

---

## Network Configuration

### Required Network Settings

- **Network**: Polygon (Mainnet)
- **Chain ID**: `137`
- **RPC URL**: Use a Polygon RPC endpoint (e.g., from Alchemy, Infura, or QuickNode)
- **Currency**: MATIC
- **Block Explorer**: https://polygonscan.com

### Example Wallet Connection Configuration

```typescript
// Example using ethers.js
const polygonNetwork = {
  chainId: '0x89', // 137 in hex
  chainName: 'Polygon Mainnet',
  nativeCurrency: {
    name: 'MATIC',
    symbol: 'MATIC',
    decimals: 18,
  },
  rpcUrls: ['YOUR_POLYGON_RPC_URL'],
  blockExplorerUrls: ['https://polygonscan.com'],
};

// Example using wagmi/viem
const polygonChain = {
  id: 137,
  name: 'Polygon',
  network: 'matic',
  nativeCurrency: {
    decimals: 18,
    name: 'MATIC',
    symbol: 'MATIC',
  },
  rpcUrls: {
    default: {
      http: ['YOUR_POLYGON_RPC_URL'],
    },
  },
  blockExplorerUrls: {
    default: { name: 'Polygonscan', url: 'https://polygonscan.com' },
  },
};
```

---

## Authentication Flow

### High-Level Flow

1. **User connects wallet** (must be on Polygon, Chain ID 137)
2. **Frontend requests nonce** from backend for the wallet address
3. **Frontend generates SIWE message** and prompts user to sign
4. **User signs message** with their wallet
5. **Frontend sends message + signature** to backend for verification
6. **Backend verifies signature** and returns JWT token + user data
7. **Frontend stores JWT securely** (see storage section)
8. **Frontend includes JWT** in all subsequent API requests

### Signup vs Signin

- **First-time users**: Automatically created on first successful authentication
- **Returning users**: Same flow, backend handles user lookup/creation automatically
- **No separate signup endpoint**: Authentication endpoint handles both cases

---

## API Endpoints

### Base URL

All endpoints are prefixed with `/api`:
- Development: `http://localhost:3001/api`
- Production: `https://your-domain.com/api`

### 1. Generate Nonce

**Endpoint**: `POST /api/auth/nonce`

**Description**: Generates a unique nonce for SIWE authentication. Must be called before signing the SIWE message.

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Request Validation**:
- `address` must be a valid Ethereum address (42 characters, starts with `0x`)
- Format: `/^0x[a-fA-F0-9]{40}$/`

**Success Response** (200):
```json
{
  "nonce": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid address format
  ```json
  {
    "error": "Invalid Ethereum address format"
  }
  ```
- `400 Bad Request`: Missing address
  ```json
  {
    "error": "Address is required"
  }
  ```
- `500 Internal Server Error`: Server error
  ```json
  {
    "error": "Failed to generate nonce"
  }
  ```

**Example Implementation**:
```typescript
async function getNonce(address: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/nonce`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate nonce');
  }

  const data = await response.json();
  return data.nonce;
}
```

---

### 2. Verify Signature & Authenticate

**Endpoint**: `POST /api/auth/verify`

**Description**: Verifies the SIWE signature and returns JWT token + user data. This endpoint handles both signup (first-time users) and signin (returning users).

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "message": "localhost:3001 wants you to sign in with your Ethereum account:\n0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\n\nURI: http://localhost:3001\nVersion: 1\nChain ID: 137\nNonce: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6\nIssued At: 2024-01-01T00:00:00.000Z",
  "signature": "0x1234567890abcdef..."
}
```

**SIWE Message Requirements**:
- Must include the nonce from step 1
- Must specify Chain ID: `137` (Polygon)
- Domain must match the backend's expected domain
- Message must not be expired

**Success Response** (200):
```json
{
  "user": {
    "id": "user-uuid-here",
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "username": "johndoe",  // null if not set yet
    "proxyWallet": "0xProxyWalletAddressOnPolygon"  // Created automatically on first signin
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response Fields**:
- `user.id`: Unique user identifier
- `user.address`: User's Ethereum wallet address
- `user.username`: Optional username (null if not set)
- `user.proxyWallet`: Gnosis Safe proxy wallet address on Polygon (created automatically on first signin)
- `token`: JWT access token (valid for 7 days)

**Error Responses**:
- `400 Bad Request`: Missing required fields
  ```json
  {
    "error": "Message and signature are required"
  }
  ```
- `401 Unauthorized`: Authentication failed
  ```json
  {
    "error": "Authentication failed: Invalid nonce"
  }
  ```
  Other possible errors:
  - `"User not found or no nonce set"`
  - `"Signature verification failed"`
  - `"Message has expired"`
  - `"Invalid domain: expected example.com, got other.com"`

**Example Implementation**:
```typescript
async function verifySignature(
  message: string,
  signature: string
): Promise<{ user: User; token: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, signature }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Authentication failed');
  }

  return await response.json();
}
```

---

### 3. Get Current User

**Endpoint**: `GET /api/auth/me`

**Description**: Returns basic information about the currently authenticated user. Used to verify token validity and get user ID/address.

**Request Headers**:
```
Authorization: Bearer <JWT_TOKEN>
```

**Success Response** (200):
```json
{
  "userId": "user-uuid-here",
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid token
  ```json
  {
    "error": "Access token required"
  }
  ```
  or
  ```json
  {
    "error": "Token expired"
  }
  ```
  or
  ```json
  {
    "error": "Invalid token"
  }
  ```

**Example Implementation**:
```typescript
async function getCurrentUser(token: string): Promise<{ userId: string; address: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Token expired or invalid - trigger reconnection
      throw new Error('TOKEN_EXPIRED');
    }
    const error = await response.json();
    throw new Error(error.error || 'Failed to get user');
  }

  return await response.json();
}
```

---

### 4. Check Username Availability

**Endpoint**: `GET /api/auth/username/check?username=<username>`

**Description**: Checks if a username is available before setting it. Can be called without authentication.

**Request**: Query parameter
- `username`: The username to check (3-20 characters, alphanumeric and underscores only)

**Username Validation Rules**:
- Length: 3-20 characters
- Characters: Only alphanumeric (a-z, A-Z, 0-9) and underscores (_)
- Case-insensitive (stored in lowercase)

**Success Response** (200):
```json
{
  "available": true,
  "username": "johndoe"
}
```

**Error Responses**:
- `400 Bad Request`: Missing or invalid username
  ```json
  {
    "error": "Username is required"
  }
  ```
- `500 Internal Server Error`: Server error
  ```json
  {
    "error": "Failed to check username availability"
  }
  ```

**Example Implementation**:
```typescript
async function checkUsernameAvailability(username: string): Promise<boolean> {
  const response = await fetch(
    `${API_BASE_URL}/auth/username/check?username=${encodeURIComponent(username)}`,
    {
      method: 'GET',
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to check username');
  }

  const data = await response.json();
  return data.available;
}
```

---

### 5. Set Username

**Endpoint**: `POST /api/auth/username/set`

**Description**: Sets a username for the authenticated user. Requires authentication.

**Request Headers**:
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body**:
```json
{
  "username": "johndoe"
}
```

**Success Response** (200):
```json
{
  "user": {
    "id": "user-uuid-here",
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "username": "johndoe"
  }
}
```

**Error Responses**:
- `400 Bad Request`: Invalid username format or already taken
  ```json
  {
    "error": "Invalid username format. Username must be 3-20 characters, alphanumeric and underscores only."
  }
  ```
  or
  ```json
  {
    "error": "Username is already taken"
  }
  ```
- `401 Unauthorized`: Authentication required
  ```json
  {
    "error": "Authentication required"
  }
  ```
- `500 Internal Server Error`: Server error
  ```json
  {
    "error": "Failed to set username"
  }
  ```

**Example Implementation**:
```typescript
async function setUsername(token: string, username: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/username/set`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to set username');
  }

  const data = await response.json();
  return data.user;
}
```

---

## JWT Token Storage (Security Best Practices)

### ⚠️ NEVER Use localStorage

**Why localStorage is unsafe:**
- Vulnerable to XSS (Cross-Site Scripting) attacks
- Accessible to any JavaScript code running on the page
- Malicious scripts can steal tokens easily

### ✅ Recommended Secure Storage Methods

#### Option 1: Memory-Only Storage (Most Secure for SPAs)

Store the token only in JavaScript memory (React state, Vue state, etc.). Token is lost on page refresh, requiring re-authentication.

**Pros:**
- Most secure (no persistent storage)
- No XSS risk from storage
- Simple implementation

**Cons:**
- User must reconnect wallet on every page refresh
- Token lost on browser close

**Example Implementation**:
```typescript
// React example
import { useState, useEffect } from 'react';

function useAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Load token from memory (will be null on refresh)
  useEffect(() => {
    // Optionally check if there's a token in memory from previous session
    // But don't persist it - require re-authentication
  }, []);

  const login = async (address: string, signer: Signer) => {
    // ... authentication flow
    const { token, user } = await authenticate(address, signer);
    setToken(token);
    setUser(user);
    // Token only exists in memory - not persisted
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    // Clear any other state
  };

  return { token, user, login, logout };
}
```

#### Option 2: httpOnly Cookies (Most Secure for Persistent Sessions)

Backend sets httpOnly cookies that cannot be accessed by JavaScript. Requires backend support for cookie-based authentication.

**Pros:**
- Most secure persistent storage
- Not accessible to JavaScript (XSS protection)
- Automatic cookie handling by browser
- Works with 7-day expiration

**Cons:**
- Requires backend changes to set cookies
- More complex CORS configuration
- May need CSRF protection

**Note**: This requires backend modifications. If backend doesn't support cookies, use Option 1 or Option 3.

#### Option 3: Secure Session Storage with Additional Protections

Use `sessionStorage` (cleared on tab close) with additional security measures. **Less secure than memory-only, but provides some persistence.**

**Pros:**
- Token persists during browser session
- Cleared when tab closes
- Slightly better UX than memory-only

**Cons:**
- Still vulnerable to XSS (but less persistent than localStorage)
- Not as secure as httpOnly cookies

**Example with Additional Protections**:
```typescript
// Store token with encryption or obfuscation
// Add Content Security Policy (CSP) headers
// Implement token rotation

function storeTokenSecurely(token: string) {
  // Optionally encrypt/obfuscate before storing
  // Use sessionStorage (cleared on tab close)
  sessionStorage.setItem('auth_token', token);
  
  // Set a flag to detect tampering
  sessionStorage.setItem('auth_verified', 'true');
}

function getTokenSecurely(): string | null {
  const token = sessionStorage.getItem('auth_token');
  const verified = sessionStorage.getItem('auth_verified');
  
  if (!token || verified !== 'true') {
    return null;
  }
  
  return token;
}
```

**⚠️ Important**: Even with sessionStorage, implement:
- Content Security Policy (CSP)
- XSS protection
- Token validation on every request
- Automatic logout on suspicious activity

#### Option 4: Hybrid Approach (Recommended for Best UX + Security)

Combine memory storage with a secure refresh mechanism:

1. Store token in memory during active session
2. On page load, check if user was recently authenticated (within last few minutes)
3. If yes, prompt for quick re-authentication (just sign message, no full flow)
4. If no recent session, require full authentication

**Implementation**:
```typescript
// Store minimal session info (not the token itself)
// Use secure, short-lived session identifier
function createSession(userAddress: string): string {
  // Create a short-lived session ID (expires in 5 minutes)
  const sessionId = generateSecureId();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  
  // Store only session metadata, not the JWT
  sessionStorage.setItem('session_id', sessionId);
  sessionStorage.setItem('session_expires', expiresAt.toString());
  sessionStorage.setItem('user_address', userAddress);
  
  return sessionId;
}

function hasValidSession(): boolean {
  const expiresAt = sessionStorage.getItem('session_expires');
  if (!expiresAt) return false;
  
  return Date.now() < parseInt(expiresAt);
}
```

### Recommended Approach for This Application

**For maximum security**: Use **Option 1 (Memory-Only)** or **Option 4 (Hybrid)**.

**Implementation Pattern**:
```typescript
// auth.ts - Secure token management
class AuthManager {
  private token: string | null = null;
  private user: User | null = null;
  private tokenExpiry: number | null = null;

  // Store token only in memory
  setToken(token: string, expiresIn: number = 7 * 24 * 60 * 60 * 1000) {
    this.token = token;
    this.tokenExpiry = Date.now() + expiresIn;
    // DO NOT store in localStorage or sessionStorage
  }

  getToken(): string | null {
    // Check if token is expired
    if (this.tokenExpiry && Date.now() >= this.tokenExpiry) {
      this.clearAuth();
      return null;
    }
    return this.token;
  }

  clearAuth() {
    this.token = null;
    this.user = null;
    this.tokenExpiry = null;
  }

  isAuthenticated(): boolean {
    return this.getToken() !== null;
  }
}

export const authManager = new AuthManager();
```

---

## Complete Implementation Flow

### Step-by-Step Authentication Flow

#### 1. Initialize Wallet Connection (Polygon)

```typescript
import { ethers } from 'ethers';
// or use wagmi/viem, web3.js, etc.

async function connectWallet(): Promise<{ address: string; signer: Signer }> {
  // Request account access
  if (typeof window.ethereum === 'undefined') {
    throw new Error('MetaMask or compatible wallet not found');
  }

  // Request connection
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  
  // Get provider and signer
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const address = await signer.getAddress();

  // Verify network (Polygon, Chain ID 137)
  const network = await provider.getNetwork();
  if (network.chainId !== 137) {
    // Prompt user to switch to Polygon
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x89' }], // 137 in hex
      });
    } catch (switchError: any) {
      // If chain doesn't exist, add it
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [polygonNetwork], // Use network config from earlier
        });
      } else {
        throw switchError;
      }
    }
  }

  return { address, signer };
}
```

#### 2. Generate Nonce

```typescript
async function getNonceForAddress(address: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate nonce');
  }

  const { nonce } = await response.json();
  return nonce;
}
```

#### 3. Create and Sign SIWE Message

```typescript
import { SiweMessage } from 'siwe';

async function createAndSignMessage(
  address: string,
  signer: Signer,
  nonce: string
): Promise<{ message: string; signature: string }> {
  // Get domain from current origin
  const domain = window.location.hostname;
  const origin = window.location.origin;

  // Create SIWE message
  const message = new SiweMessage({
    domain,
    address,
    statement: 'Sign in with Ethereum to the app.',
    uri: origin,
    version: '1',
    chainId: 137, // Polygon
    nonce,
    issuedAt: new Date().toISOString(),
  });

  const messageToSign = message.prepareMessage();

  // Sign message with wallet
  const signature = await signer.signMessage(messageToSign);

  return {
    message: messageToSign,
    signature,
  };
}
```

#### 4. Verify and Authenticate

```typescript
async function authenticate(
  address: string,
  signer: Signer
): Promise<{ user: User; token: string }> {
  // Step 1: Get nonce
  const nonce = await getNonceForAddress(address);

  // Step 2: Create and sign message
  const { message, signature } = await createAndSignMessage(address, signer, nonce);

  // Step 3: Verify with backend
  const response = await fetch(`${API_BASE_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Authentication failed');
  }

  const data = await response.json();
  
  // Step 4: Store token securely (in memory only)
  authManager.setToken(data.token);
  authManager.setUser(data.user);

  return data;
}
```

#### 5. Complete Authentication Function

```typescript
async function signIn(): Promise<void> {
  try {
    // 1. Connect wallet (must be on Polygon)
    const { address, signer } = await connectWallet();

    // 2. Authenticate
    const { user, token } = await authenticate(address, signer);

    // 3. Update app state
    setCurrentUser(user);
    setAuthenticated(true);

    // 4. Token is stored in memory via authManager
    // No localStorage usage

    console.log('Authentication successful!', user);
  } catch (error) {
    console.error('Authentication failed:', error);
    throw error;
  }
}
```

#### 6. Making Authenticated API Requests

```typescript
async function makeAuthenticatedRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = authManager.getToken();

  if (!token) {
    throw new Error('Not authenticated');
  }

  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

// Example usage
async function getUserBalance() {
  const response = await makeAuthenticatedRequest('/deposit/balance');
  if (!response.ok) {
    if (response.status === 401) {
      // Token expired - trigger reconnection
      authManager.clearAuth();
      throw new Error('TOKEN_EXPIRED');
    }
    throw new Error('Failed to get balance');
  }
  return response.json();
}
```

#### 7. Username Flow (Optional)

```typescript
async function setUserUsername(token: string, username: string): Promise<void> {
  // First, check availability
  const isAvailable = await checkUsernameAvailability(username);
  if (!isAvailable) {
    throw new Error('Username is already taken');
  }

  // Then set it
  const response = await fetch(`${API_BASE_URL}/auth/username/set`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to set username');
  }

  const { user } = await response.json();
  // Update user in state
  setCurrentUser(user);
}
```

---

## Error Handling

### Common Error Scenarios

#### 1. Wallet Not Connected
```typescript
try {
  await connectWallet();
} catch (error) {
  if (error.message.includes('not found')) {
    // Show "Install MetaMask" message
  } else if (error.message.includes('rejected')) {
    // User rejected connection
  }
}
```

#### 2. Wrong Network
```typescript
// Always verify network before proceeding
const network = await provider.getNetwork();
if (network.chainId !== 137) {
  // Prompt to switch to Polygon
  await switchToPolygon();
}
```

#### 3. Authentication Failures
```typescript
try {
  await authenticate(address, signer);
} catch (error) {
  if (error.message.includes('Invalid nonce')) {
    // Retry: Get new nonce and try again
  } else if (error.message.includes('expired')) {
    // Message expired: Generate new nonce and message
  } else if (error.message.includes('Signature verification')) {
    // Signature invalid: User may have wrong wallet
  }
}
```

#### 4. Token Expired
```typescript
// In API request interceptor
if (response.status === 401) {
  const error = await response.json();
  if (error.error === 'Token expired' || error.error === 'Invalid token') {
    // Clear auth state
    authManager.clearAuth();
    setAuthenticated(false);
    setCurrentUser(null);
    
    // Show reconnection prompt
    showReconnectPrompt();
  }
}
```

---

## Token Expiration & Reconnection

### Token Lifecycle

- **Token Expiration**: 7 days from issuance
- **Token Storage**: Memory only (not persisted)
- **Reconnection Required When**:
  1. Token expires (after 7 days)
  2. User explicitly logs out
  3. Page refresh (if using memory-only storage)
  4. Token becomes invalid (server-side revocation)

### Handling Token Expiration

#### Option 1: Proactive Token Validation

```typescript
// Check token validity on app initialization
async function checkAuthStatus(): Promise<boolean> {
  const token = authManager.getToken();
  
  if (!token) {
    return false;
  }

  try {
    // Verify token is still valid
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const { userId, address } = await response.json();
      // Token is valid - user is authenticated
      return true;
    } else {
      // Token expired or invalid
      authManager.clearAuth();
      return false;
    }
  } catch (error) {
    // Network error - assume token is invalid
    authManager.clearAuth();
    return false;
  }
}
```

#### Option 2: Automatic Reconnection Prompt

```typescript
// Show reconnection UI when token expires
function handleTokenExpiration() {
  authManager.clearAuth();
  setAuthenticated(false);
  setCurrentUser(null);
  
  // Show user-friendly message
  showNotification({
    type: 'info',
    message: 'Your session has expired. Please reconnect your wallet.',
    action: {
      label: 'Reconnect',
      onClick: () => signIn(),
    },
  });
}
```

#### Option 3: Silent Re-authentication (If User Recently Authenticated)

```typescript
// If using hybrid approach with session metadata
async function attemptSilentReauth(): Promise<boolean> {
  const sessionId = sessionStorage.getItem('session_id');
  const userAddress = sessionStorage.getItem('user_address');
  
  if (!sessionId || !userAddress || !hasValidSession()) {
    return false;
  }

  // Session was recent (within 5 minutes) - allow quick re-auth
  try {
    const { address, signer } = await connectWallet();
    
    if (address.toLowerCase() !== userAddress.toLowerCase()) {
      return false; // Different wallet
    }

    // Quick re-authentication (user just needs to sign)
    await authenticate(address, signer);
    return true;
  } catch (error) {
    return false;
  }
}
```

### Logout Flow

```typescript
function logout() {
  // Clear memory state
  authManager.clearAuth();
  
  // Clear any session metadata (if using hybrid approach)
  sessionStorage.removeItem('session_id');
  sessionStorage.removeItem('session_expires');
  sessionStorage.removeItem('user_address');
  
  // Update UI state
  setAuthenticated(false);
  setCurrentUser(null);
  
  // Optionally disconnect wallet
  // (Some wallets don't support programmatic disconnection)
}
```

---

## Complete Example: React Hook

```typescript
// useAuth.ts
import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { SiweMessage } from 'siwe';

interface User {
  id: string;
  address: string;
  username?: string;
  proxyWallet?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check auth status on mount (if token exists in memory)
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    const storedToken = getTokenFromMemory(); // Your memory storage
    if (!storedToken) return;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${storedToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        setToken(storedToken);
        setIsAuthenticated(true);
        // Note: /auth/me doesn't return full user, you may need to fetch it
      } else {
        clearAuth();
      }
    } catch (error) {
      clearAuth();
    }
  };

  const signIn = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Connect wallet
      if (typeof window.ethereum === 'undefined') {
        throw new Error('Wallet not found');
      }

      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const address = await signer.getAddress();

      // Verify Polygon network
      const network = await provider.getNetwork();
      if (network.chainId !== 137) {
        await switchToPolygon();
      }

      // 2. Get nonce
      const nonceResponse = await fetch(`${API_BASE_URL}/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const { nonce } = await nonceResponse.json();

      // 3. Create SIWE message
      const message = new SiweMessage({
        domain: window.location.hostname,
        address,
        statement: 'Sign in with Ethereum to the app.',
        uri: window.location.origin,
        version: '1',
        chainId: 137,
        nonce,
        issuedAt: new Date().toISOString(),
      });
      const messageToSign = message.prepareMessage();

      // 4. Sign message
      const signature = await signer.signMessage(messageToSign);

      // 5. Verify
      const verifyResponse = await fetch(`${API_BASE_URL}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageToSign, signature }),
      });

      if (!verifyResponse.ok) {
        const error = await verifyResponse.json();
        throw new Error(error.error || 'Authentication failed');
      }

      const { user, token } = await verifyResponse.json();

      // 6. Store in memory only
      setToken(token);
      setUser(user);
      setIsAuthenticated(true);
      storeTokenInMemory(token); // Your memory storage function

      return { user, token };
    } catch (error) {
      clearAuth();
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearAuth();
  }, []);

  const clearAuth = () => {
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    clearTokenFromMemory(); // Your memory storage function
  };

  const setUsername = useCallback(async (username: string) => {
    if (!token) throw new Error('Not authenticated');

    // Check availability
    const checkResponse = await fetch(
      `${API_BASE_URL}/auth/username/check?username=${encodeURIComponent(username)}`
    );
    const { available } = await checkResponse.json();
    if (!available) {
      throw new Error('Username is already taken');
    }

    // Set username
    const setResponse = await fetch(`${API_BASE_URL}/auth/username/set`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username }),
    });

    if (!setResponse.ok) {
      const error = await setResponse.json();
      throw new Error(error.error || 'Failed to set username');
    }

    const { user: updatedUser } = await setResponse.json();
    setUser(updatedUser);
  }, [token]);

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    signIn,
    logout,
    setUsername,
  };
}
```

---

## Summary

### Key Points

1. **Network**: Always use Polygon (Chain ID: 137)
2. **Storage**: Never use localStorage - use memory-only or httpOnly cookies
3. **Token Expiration**: 7 days - handle reconnection gracefully
4. **Flow**: Connect wallet → Get nonce → Sign message → Verify → Store token in memory
5. **Username**: Optional, can be set after authentication
6. **Security**: Token in memory only, validate on every request, handle expiration

### Security Checklist

- ✅ Never store JWT in localStorage
- ✅ Use memory-only storage or httpOnly cookies
- ✅ Verify network is Polygon (137) before authentication
- ✅ Validate token on app initialization
- ✅ Handle token expiration gracefully
- ✅ Clear auth state on logout
- ✅ Implement proper error handling
- ✅ Use HTTPS in production
- ✅ Implement Content Security Policy (CSP)

---

## Additional Resources

- SIWE Documentation: https://login.xyz/
- Polygon Network: https://polygon.technology/
- JWT Best Practices: https://datatracker.ietf.org/doc/html/rfc8725

