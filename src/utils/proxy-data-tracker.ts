/**
 * Tracks data sent and received through proxy for a specific request
 */
export interface ProxyDataUsage {
  dataSentBytes: number;
  dataReceivedBytes: number;
  dataSentGB: number;
  dataReceivedGB: number;
  totalDataGB: number;
}

// Global tracker instance for the current request
let currentTracker: ProxyDataTracker | null = null;

/**
 * Creates a data tracker that intercepts https.request calls
 * Returns the tracker instance and a cleanup function
 */
export function createProxyDataTracker(): {
  tracker: ProxyDataTracker;
  cleanup: () => void;
} {
  const tracker = new ProxyDataTracker();
  currentTracker = tracker;
  
  // Patch https.request to track data
  const https = require('https');
  const http = require('http');
  
  const originalHttpsRequest = https.request;
  const originalHttpRequest = http.request;
  
  // Track requests
  https.request = function(options: any, callback?: any) {
    const req = originalHttpsRequest.call(this, options, callback);
    
    // Only track if this is a CLOB API request and we have a tracker
    if (currentTracker && (options.hostname === 'clob.polymarket.com' || 
        (options.host && options.host.includes('clob.polymarket.com')))) {
      currentTracker.trackRequest(req);
    }
    
    return req;
  };
  
  http.request = function(options: any, callback?: any) {
    const req = originalHttpRequest.call(this, options, callback);
    
    if (currentTracker && (options.hostname === 'clob.polymarket.com' || 
        (options.host && options.host.includes('clob.polymarket.com')))) {
      currentTracker.trackRequest(req);
    }
    
    return req;
  };
  
  const cleanup = () => {
    https.request = originalHttpsRequest;
    http.request = originalHttpRequest;
    currentTracker = null;
  };
  
  return { tracker, cleanup };
}

/**
 * Tracks data usage for HTTP/HTTPS requests
 */
export class ProxyDataTracker {
  private dataSentBytes = 0;
  private dataReceivedBytes = 0;
  private trackedRequests = new Set<any>();
  
  /**
   * Track a request to monitor data sent/received
   */
  trackRequest(req: any): void {
    if (this.trackedRequests.has(req)) {
      return; // Already tracking this request
    }
    
    this.trackedRequests.add(req);
    
    // Track data sent (request body)
    const originalWrite = req.write;
    req.write = (chunk: any, encoding?: any, callback?: any) => {
      if (chunk) {
        const size = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
        this.dataSentBytes += size;
      }
      return originalWrite.call(req, chunk, encoding, callback);
    };
    
    const originalEnd = req.end;
    req.end = (chunk?: any, encoding?: any, callback?: any) => {
      if (chunk) {
        const size = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
        this.dataSentBytes += size;
      }
      return originalEnd.call(req, chunk, encoding, callback);
    };
    
    // Track data received (response body)
    req.on('response', (res: any) => {
      // Track response headers size
      const headersSize = Buffer.byteLength(JSON.stringify(res.headers));
      this.dataReceivedBytes += headersSize;
      
      // Track response body
      res.on('data', (chunk: Buffer) => {
        this.dataReceivedBytes += chunk.length;
      });
    });
  }
  
  /**
   * Get current data usage statistics
   */
  getUsage(): ProxyDataUsage {
    const dataSentGB = this.dataSentBytes / (1024 * 1024 * 1024);
    const dataReceivedGB = this.dataReceivedBytes / (1024 * 1024 * 1024);
    const totalDataGB = dataSentGB + dataReceivedGB;
    
    return {
      dataSentBytes: this.dataSentBytes,
      dataReceivedBytes: this.dataReceivedBytes,
      dataSentGB,
      dataReceivedGB,
      totalDataGB,
    };
  }
  
  /**
   * Reset the tracker
   */
  reset(): void {
    this.dataSentBytes = 0;
    this.dataReceivedBytes = 0;
    this.trackedRequests.clear();
  }
}

