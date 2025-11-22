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
    // Check if it's a SOCKS5 proxy (including socks5h for DNS resolution through proxy)
    if (proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks5h://') || proxyUrl.startsWith('socks://')) {
      return new SocksProxyAgent(proxyUrl) as Agent;
    }
    
    // HTTP/HTTPS proxy - disable SSL verification for proxy connection
    // The proxy intercepts the connection and presents its own certificate
    // which doesn't match the target hostname, so we need to disable verification
    return new HttpsProxyAgent(proxyUrl, {
      rejectUnauthorized: false,
    }) as Agent;
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
  // If CLOB-specific proxy URL is set, use that (Oxylabs residential proxy)
  if (config.proxy?.clobProxyUrl) {
    try {
      const proxyUrl = config.proxy.clobProxyUrl;
      // Check if it's a SOCKS5 proxy (including socks5h for DNS resolution through proxy)
      if (proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks5h://') || proxyUrl.startsWith('socks://')) {
        return new SocksProxyAgent(proxyUrl) as Agent;
      }
      // HTTP/HTTPS proxy - disable SSL verification for proxy connection
      // The proxy intercepts the connection and presents its own certificate (*.bc.pr.oxylabs.io)
      // which doesn't match the target hostname (clob.polymarket.com), so we need to disable verification
      return new HttpsProxyAgent(proxyUrl, {
        rejectUnauthorized: false,
      }) as Agent;
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
  // If CLOB-specific proxy is set (and not empty), use it
  if (config.proxy?.clobProxyUrl && config.proxy.clobProxyUrl.trim() !== '') {
    return true;
  }
  
  // Otherwise, check general proxy
  return isProxyEnabled();
}

/**
 * Check if proxy is configured and enabled
 */
export function isProxyEnabled(): boolean {
  // First check if proxy is explicitly disabled
  if (config.proxy?.enabled === false) {
    return false;
  }
  
  // If enabled is not explicitly true, don't enable proxy
  if (config.proxy?.enabled !== true) {
    return false;
  }
  
  // Check if proxy URL is set (and not empty) or Oxylabs credentials are provided
  const hasProxyUrl = !!(config.proxy.url && config.proxy.url.trim() !== '');
  const hasOxylabsCreds = !!(config.proxy.oxylabs?.username && 
                             config.proxy.oxylabs?.username.trim() !== '' &&
                             config.proxy.oxylabs?.password && 
                             config.proxy.oxylabs?.password.trim() !== '');
  
  return hasProxyUrl || hasOxylabsCreds;
}

/**
 * Format Oxylabs proxy URL
 * Supports both datacenter (dc.oxylabs.io) and residential (pr.oxylabs.io) proxies
 * 
 * For HTTPS proxies with session control, Oxylabs uses format:
 * http://customer-USERNAME-cc-COUNTRY-city-CITY-sessid-RANDOM-sesstime-MINUTES:PASSWORD@pr.oxylabs.io:7777
 * 
 * @param username Oxylabs username (base username without session parameters)
 * @param password Oxylabs password
 * @param proxyType 'http' or 'socks5'
 * @param country Optional country code (e.g., 'us', 'gb', 'de')
 * @param useDatacenter Use datacenter proxy (dc.oxylabs.io) instead of residential (pr.oxylabs.io)
 * @param city Optional city name (e.g., 'hamburg', 'newyork')
 * @param sessionId Optional session ID for sticky sessions (random number if not provided)
 * @param sessionTime Optional session duration in minutes (default: 10)
 */
export function formatOxylabsUrl(
  username: string,
  password: string,
  proxyType: 'http' | 'socks5' = 'http',
  country?: string,
  useDatacenter: boolean = false,
  city?: string,
  sessionId?: string,
  sessionTime: number = 10
): string {
  // Use socks5h for SOCKS5 to resolve DNS through proxy (prevents DNS leaks)
  const protocol = proxyType === 'socks5' ? 'socks5h' : 'http';
  
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
    // Residential proxy
    const port = proxyType === 'socks5' ? '30001' : '7777';
    
    if (proxyType === 'socks5') {
      // SOCKS5 uses country-specific subdomain (e.g., de-pr.oxylabs.io)
      const host = country ? `${country.toLowerCase()}-pr.oxylabs.io` : 'pr.oxylabs.io';
      const fullUsername = username.startsWith('customer-') ? username : `customer-${username}`;
      return `${protocol}://${fullUsername}:${password}@${host}:${port}`;
    } else {
      // HTTP proxy uses pr.oxylabs.io with session parameters in username
      // Format: customer-USERNAME-cc-COUNTRY-city-CITY-sessid-ID-sesstime-MINUTES
      const baseUsername = username.startsWith('customer-') ? username : `customer-${username}`;
      
      let fullUsername = baseUsername;
      
      // Add country code if provided
      if (country) {
        fullUsername += `-cc-${country.toLowerCase()}`;
      }
      
      // Add city if provided
      if (city) {
        fullUsername += `-city-${city.toLowerCase()}`;
      }
      
      // Add session ID (use provided or generate random)
      const sessId = sessionId || Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
      fullUsername += `-sessid-${sessId}`;
      
      // Add session time
      fullUsername += `-sesstime-${sessionTime}`;
      
      return `${protocol}://${fullUsername}:${password}@pr.oxylabs.io:${port}`;
    }
  }
}