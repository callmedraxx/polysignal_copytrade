import { SiweMessage } from 'siwe';
import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { User } from '@prisma/client';
import { config } from '../config/env';
import { prisma } from '../config/database';
import { createProxyWallet } from './wallet';
import { preWarmClobClient } from './clob-client-cache';
import { getUserLogger } from '../utils/user-logger';

export interface AuthResult {
  user: {
    id: string;
    address: string;
    username?: string;
    proxyWallet?: string;
  };
  token: string;
}

/**
 * Generate a random nonce for SIWE
 */
export async function generateNonce(address: string): Promise<string> {
  const nonce = randomBytes(16).toString('hex');
  
  // Store or update nonce for the address
  await prisma.user.upsert({
    where: { address: address.toLowerCase() },
    update: { nonce },
    create: {
      address: address.toLowerCase(),
      nonce,
    },
  });

  return nonce;
}

/**
 * Verify SIWE message and signature, then generate JWT
 */
export async function verifyAndAuthenticate(
  message: string,
  signature: string,
  ipAddress?: string
): Promise<AuthResult> {
  try {
    // Parse SIWE message
    const siweMessage = new SiweMessage(message);
    
    // Validate message structure and expiration
    const messageString = siweMessage.prepareMessage();
    
    // Check expiration if present
    if (siweMessage.expirationTime) {
      const expirationDate = new Date(siweMessage.expirationTime);
      if (expirationDate < new Date()) {
        throw new Error('Message has expired');
      }
    }
    
    // Verify signature using ethers v5 (SIWE v3 requires manual verification)
    const recoveredAddress = ethers.utils.verifyMessage(messageString, signature);
    
    // Get the address from the message
    const address = siweMessage.address.toLowerCase();
    
    // Verify the recovered address matches the message address
    if (recoveredAddress.toLowerCase() !== address) {
      throw new Error('Signature verification failed');
    }
    
    // Get fields from the parsed message
    const fields = siweMessage;

    // Check if user already exists in database
    let user = await prisma.user.findUnique({
      where: { address },
    });

    // Initialize user logger
    const userLogger = getUserLogger(address, ipAddress);

    // If user exists, verify signature and return user data with new JWT
    // Skip nonce check and proxy wallet creation for existing users
    if (user && user.proxyWallet) {
      // Verify domain matches (allow localhost, polysignal.io and its subdomains)
      const messageDomain = fields.domain.toLowerCase();
      
      // Allow localhost variations
      const isLocalhost = messageDomain === 'localhost' || messageDomain.startsWith('localhost:');
      
      // Allow polysignal.io and any subdomain (e.g., www.polysignal.io, app.polysignal.io)
      const isPolysignalDomain = messageDomain === 'polysignal.io' || messageDomain.endsWith('.polysignal.io');
      
      // Also allow the domain from config.app.url if it's different
      const expectedDomain = new URL(config.app.url).hostname.toLowerCase();
      const isExpectedDomain = messageDomain === expectedDomain;
      
      if (!isLocalhost && !isPolysignalDomain && !isExpectedDomain) {
        throw new Error(`Invalid domain: expected localhost, polysignal.io (or subdomain), or ${expectedDomain}, got ${messageDomain}`);
      }

      // Clear the nonce if it exists (for cleanup)
      if (user.nonce) {
        await prisma.user.update({
          where: { address },
          data: { nonce: null },
        });
      }

      // Generate JWT token for existing user
      const expiresIn = config.jwt.expiresIn && config.jwt.expiresIn.trim() !== '' 
        ? config.jwt.expiresIn 
        : '7d';
      // @ts-expect-error - expiresIn accepts string values like '7d' at runtime, but TypeScript types are overly strict
      const token = jwt.sign(
        {
          userId: user.id,
          address: user.address,
        },
        config.jwt.secret,
        {
          expiresIn,
        }
      );

      userLogger.login(user.id.toString(), { address, proxyWallet: user.proxyWallet });
      console.log(`✅ Existing user authenticated: ${address}`);

      return {
        user: {
          id: user.id,
          address: user.address,
          username: user.username || undefined,
          proxyWallet: user.proxyWallet || undefined,
        },
        token,
      };
    }

    // For new users or users without proxy wallet, do full authentication flow with nonce check
    if (!user || !user.nonce) {
      userLogger.error('AUTH', 'Authentication failed: User not found or no nonce set');
      throw new Error('User not found or no nonce set. Please request a new nonce first.');
    }

    if (fields.nonce !== user.nonce) {
      userLogger.error('AUTH', 'Authentication failed: Invalid nonce', { 
        expected: user.nonce, 
        received: fields.nonce 
      });
      throw new Error('Invalid nonce');
    }

    // Verify domain matches (allow localhost, polysignal.io and its subdomains)
    const messageDomain = fields.domain.toLowerCase();
    
    // Allow localhost variations
    const isLocalhost = messageDomain === 'localhost' || messageDomain.startsWith('localhost:');
    
    // Allow polysignal.io and any subdomain (e.g., www.polysignal.io, app.polysignal.io)
    const isPolysignalDomain = messageDomain === 'polysignal.io' || messageDomain.endsWith('.polysignal.io');
    
    // Also allow the domain from config.app.url if it's different
    const expectedDomain = new URL(config.app.url).hostname.toLowerCase();
    const isExpectedDomain = messageDomain === expectedDomain;
    
    if (!isLocalhost && !isPolysignalDomain && !isExpectedDomain) {
      throw new Error(`Invalid domain: expected localhost, polysignal.io (or subdomain), or ${expectedDomain}, got ${messageDomain}`);
    }

    // Clear the nonce after successful verification
    await prisma.user.update({
      where: { address },
      data: { nonce: null },
    });

    // Check if user already has a proxy wallet
    let updatedUser = user;
    const isNewUser = !user.proxyWallet;
    
    if (isNewUser) {
      userLogger.signup(user.id, { address });
      try {
        userLogger.info('SAFE_DEPLOYMENT', 'Initiating Safe wallet deployment');
        console.log(`🔐 Creating proxy wallet for user: ${address}`);
        // Create proxy wallet on Polygon using Gnosis Safe Factory
        const proxyWalletAddress = await createProxyWallet(address);
        
        // Update user with proxy wallet address
        updatedUser = await prisma.user.update({
          where: { address },
          data: { proxyWallet: proxyWalletAddress.toLowerCase() },
        });
        
        userLogger.safeDeployment(proxyWalletAddress, 'pending', { 
          userId: user.id 
        });
        console.log(`✅ Proxy wallet created and saved: ${proxyWalletAddress}`);
        
        // Immediately create and cache CLOB client for this user
        // This ensures the client is always available and ready to use
        try {
          console.log(`🔑 Pre-warming CLOB client for user: ${address}`);
          await preWarmClobClient(address);
          userLogger.info('CLOB_CLIENT', 'CLOB client pre-warmed and cached');
          console.log(`✅ CLOB client pre-warmed and cached for user: ${address}`);
        } catch (error) {
          // Log error but don't fail authentication
          // The client will be created on-demand if needed
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          userLogger.warn('CLOB_CLIENT', 'Failed to pre-warm CLOB client', { error: errorMessage });
          console.error(`⚠️ Failed to pre-warm CLOB client for ${address}:`, errorMessage);
          console.error(`   Client will be created on-demand when needed`);
        }
      } catch (error) {
        // Log error but don't fail authentication
        // User can still sign in, proxy wallet creation can be retried later
        userLogger.safeDeploymentError(error, { userId: user.id });
        console.error(`⚠️ Failed to create proxy wallet for ${address}:`, error);
        // Continue with authentication even if wallet creation fails
      }
    } else {
      userLogger.login(user.id.toString(), { address, proxyWallet: user.proxyWallet });
      console.log(`✅ User already has proxy wallet: ${user.proxyWallet}`);
    }

    // Generate JWT token
    const expiresIn = config.jwt.expiresIn && config.jwt.expiresIn.trim() !== '' 
      ? config.jwt.expiresIn 
      : '7d';
    // @ts-expect-error - expiresIn accepts string values like '7d' at runtime, but TypeScript types are overly strict
    const token = jwt.sign(
      {
        userId: updatedUser.id,
        address: updatedUser.address,
      },
      config.jwt.secret,
      {
        expiresIn,
      }
    );

    return {
      user: {
        id: updatedUser.id,
        address: updatedUser.address,
        username: updatedUser.username || undefined,
        proxyWallet: updatedUser.proxyWallet || undefined,
      },
      token,
    };
  } catch (error) {
    throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get user by address
 */
export async function getUserByAddress(address: string) {
  return prisma.user.findUnique({
    where: { address: address.toLowerCase() },
  });
}

/**
 * Check if a username is available
 * @param username The username to check
 * @returns true if username is available, false otherwise
 */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  // Validate username format
  if (!username || typeof username !== 'string') {
    return false;
  }

  // Username validation: 3-20 characters, alphanumeric and underscores only
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!usernameRegex.test(username)) {
    return false;
  }

  // Check if username already exists
  const existingUser = await prisma.user.findFirst({
    where: { username: username.toLowerCase() },
  });

  return !existingUser;
}

/**
 * Set username for a user
 * @param address User's Ethereum address
 * @param username The username to set
 * @returns Updated user object
 */
export async function setUsername(address: string, username: string): Promise<User> {
  // Validate username format
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!usernameRegex.test(username)) {
    throw new Error('Invalid username format. Username must be 3-20 characters, alphanumeric and underscores only.');
  }

  // Check if username is available
  const isAvailable = await isUsernameAvailable(username);
  if (!isAvailable) {
    throw new Error('Username is already taken');
  }

  // Update user with username
  const user = await prisma.user.findUnique({
    where: { address: address.toLowerCase() },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return prisma.user.update({
    where: { address: address.toLowerCase() },
    data: { username: username.toLowerCase() },
  });
}

