import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { config } from '../config/env';
import type { Agent } from 'https';

/**
 * Get proxy agent for HTTP requests
 * Supports Oxylabs and other HTTP/SOCKS5 proxies
 */
export function getProxyAgent(): Agent | undefined {
  // Check if proxy is enabled
  if (!config.proxy?.enabled) {
    return undefined;
  }

  // Get proxy URL - either directly configured or auto-format from Oxylabs credentials
  let proxyUrl = config.proxy.url;
  
  // If no direct URL but Oxylabs credentials are provided, auto-format the URL
  if (!proxyUrl && config.proxy.oxylabs?.username && config.proxy.oxylabs?.password) {
    proxyUrl = formatOxylabsUrl(
      config.proxy.oxylabs.username,
      config.proxy.oxylabs.password,
      config.proxy.oxylabs.proxyType,
      config.proxy.oxylabs.country || undefined,
      config.proxy.oxylabs.useDatacenter || false
    );
  }
  
  if (!proxyUrl) {
    return undefined;
  }

  try {
    // Check if it's a SOCKS5 proxy
    if (proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks://')) {
      return new SocksProxyAgent(proxyUrl) as Agent;
    }
    
    // HTTP/HTTPS proxy
    return new HttpsProxyAgent(proxyUrl) as Agent;
  } catch (error) {
    console.error('Failed to create proxy agent:', error);
    return undefined;
  }
}

/**
 * Get proxy agent for Node.js fetch
 * Returns agent that can be used with fetch options
 */
export function getFetchProxyAgent(): any {
  return getProxyAgent();
}

/**
 * Get CLOB-specific proxy agent
 * If CLOB_PROXY_URL is set, uses that instead of the general proxy
 * This allows routing CLOB orders through local machine while keeping Oxylabs config for other uses
 */
export function getClobProxyAgent(): Agent | undefined {
  // If CLOB-specific proxy URL is set, use that (for local machine routing)
  if (config.proxy?.clobProxyUrl) {
    try {
      const proxyUrl = config.proxy.clobProxyUrl;
      // Check if it's a SOCKS5 proxy
      if (proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks://')) {
        return new SocksProxyAgent(proxyUrl) as Agent;
      }
      // HTTP/HTTPS proxy
      return new HttpsProxyAgent(proxyUrl) as Agent;
    } catch (error) {
      console.error('Failed to create CLOB proxy agent:', error);
      return undefined;
    }
  }
  
  // Otherwise, use the general proxy (Oxylabs or other)
  return getProxyAgent();
}

/**
 * Check if CLOB proxy is enabled
 * Returns true if CLOB_PROXY_URL is set, or if general proxy is enabled
 */
export function isClobProxyEnabled(): boolean {
  // If CLOB-specific proxy is set, use it
  if (config.proxy?.clobProxyUrl) {
    return true;
  }
  
  // Otherwise, check general proxy
  return isProxyEnabled();
}

/**
 * Check if proxy is configured and enabled
 */
export function isProxyEnabled(): boolean {
  if (!config.proxy?.enabled) {
    return false;
  }
  
  // Check if proxy URL is set or Oxylabs credentials are provided
  const hasProxyUrl = !!config.proxy.url;
  const hasOxylabsCreds = !!(config.proxy.oxylabs?.username && config.proxy.oxylabs?.password);
  
  return hasProxyUrl || hasOxylabsCreds;
}

/**
 * Format Oxylabs proxy URL
 * Supports both datacenter (dc.oxylabs.io) and residential (pr.oxylabs.io) proxies
 * @param username Oxylabs username (can include country like user-xxx-country-US)
 * @param password Oxylabs password
 * @param proxyType 'http' or 'socks5'
 * @param country Optional country code (e.g., 'us', 'gb') - ignored if already in username
 * @param useDatacenter Use datacenter proxy (dc.oxylabs.io) instead of residential (pr.oxylabs.io)
 */
export function formatOxylabsUrl(
  username: string,
  password: string,
  proxyType: 'http' | 'socks5' = 'http',
  country?: string,
  useDatacenter: boolean = false
): string {
  const protocol = proxyType === 'socks5' ? 'socks5' : 'http';
  
  if (useDatacenter) {
    // Datacenter proxy: dc.oxylabs.io:8000
    const port = '8000';
    // Username can include country (user-xxx-country-US) or we add it
    const fullUsername = username.includes('-country-') 
      ? username 
      : country 
        ? `${username}-country-${country.toUpperCase()}`
        : username;
    
    return `${protocol}://${fullUsername}:${password}@dc.oxylabs.io:${port}`;
  } else {
    // Residential proxy: pr.oxylabs.io:7777
    const port = proxyType === 'socks5' ? '1080' : '7777';
    const endpoint = country ? `pr.oxylabs.io:${port}/country-${country}` : `pr.oxylabs.io:${port}`;
    
    // For residential, username should be in customer-xxx format
    const fullUsername = username.startsWith('customer-') ? username : `customer-${username}`;
    
    return `${protocol}://${fullUsername}:${password}@${endpoint}`;
  }
}

