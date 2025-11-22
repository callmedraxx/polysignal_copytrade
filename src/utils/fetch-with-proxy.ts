import { getFetchProxyAgent, isProxyEnabled } from './proxy-agent';

/**
 * Fetch wrapper that automatically uses proxy if configured
 * This ensures all HTTP requests go through Oxylabs proxy when enabled
 */
export async function fetchWithProxy(
  url: string | URL,
  init?: RequestInit
): Promise<Response> {
  const agent = getFetchProxyAgent();
  
  // If proxy is enabled and agent is available, add it to fetch options
  if (isProxyEnabled() && agent) {
    // Node.js fetch supports agent in the options
    const fetchOptions: any = {
      ...init,
      // @ts-ignore - agent is supported in Node.js fetch
      agent: agent,
    };
    
    return fetch(url, fetchOptions);
  }
  
  // No proxy, use regular fetch
  return fetch(url, init);
}

/**
 * Check if proxy is enabled (for logging/debugging)
 */
export { isProxyEnabled };

