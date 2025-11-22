#!/usr/bin/env node
/**
 * Test proxy with axios to check for redirect issues
 * Tests actual CLOB API endpoints that the CLOB client uses
 */

// Try to require axios - handle pnpm's module resolution and ESM/CommonJS differences
let axios;
try {
  const axiosModule = require('axios');
  // Handle both default export and named export
  axios = axiosModule.default || axiosModule;
  if (!axios || typeof axios.create !== 'function') {
    throw new Error('axios.create is not a function');
  }
} catch (e) {
  // Try direct path for pnpm
  try {
    const axiosModule = require('/app/node_modules/.pnpm/axios@1.13.2/node_modules/axios');
    axios = axiosModule.default || axiosModule;
    if (!axios || typeof axios.create !== 'function') {
      throw new Error('axios.create is not a function from direct path');
    }
  } catch (e2) {
    console.error('Failed to load axios:', e.message);
    console.error('Direct path error:', e2.message);
    process.exit(1);
  }
}
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const proxyUrl = process.env.CLOB_PROXY_URL;
const CLOB_API_URL = 'https://clob.polymarket.com';

if (!proxyUrl) {
  console.error('❌ CLOB_PROXY_URL is not set!');
  process.exit(1);
}

console.log('🔍 Testing Proxy with Axios (CLOB API Endpoints)...\n');
console.log(`Proxy URL: ${proxyUrl}`);
console.log(`Target: ${CLOB_API_URL}\n`);

// Create proxy agent
let agent;
try {
  if (proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks5h://') || proxyUrl.startsWith('socks://')) {
    agent = new SocksProxyAgent(proxyUrl);
    console.log('✅ Created SOCKS5 proxy agent');
  } else {
    agent = new HttpsProxyAgent(proxyUrl, {
      rejectUnauthorized: false,
    });
    console.log('✅ Created HTTPS proxy agent');
  }
} catch (error) {
  console.error('❌ Failed to create proxy agent:', error.message);
  process.exit(1);
}

// Test with axios - this is what the CLOB client uses
async function testAxios() {
  // Test 1: GET /book endpoint (public endpoint, no auth needed)
  console.log('\n1. Testing axios GET to /book endpoint (public, no auth)...');
  try {
    const axiosInstance = axios.create({
      httpsAgent: agent,
      httpAgent: agent,
      maxRedirects: 100,
      timeout: 30000,
      validateStatus: () => true,
    });

    // Use a real token_id from a known market
    const response = await axiosInstance.get(`${CLOB_API_URL}/book?token_id=0x04d4b6e3d5e8d8a8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8`, {
      httpsAgent: agent,
      httpAgent: agent,
      maxRedirects: 100,
      validateStatus: () => true,
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Final URL: ${response.request?.res?.responseUrl || response.config?.url}`);
    console.log(`   Request URL: ${response.config?.url}`);
    console.log(`   Redirect count: ${response.request?._redirectCount || 0}`);
    
    if (response.status === 200) {
      console.log('   ✅ SUCCESS: Axios can reach CLOB API /book through proxy!');
    } else if (response.status === 400 || response.status === 404) {
      console.log(`   ✅ SUCCESS: Reached CLOB API (got expected error for invalid token_id)`);
      console.log(`   Response: ${JSON.stringify(response.data).substring(0, 200)}`);
    } else if (response.status === 403) {
      console.log(`   ✅ SUCCESS: Reached CLOB API (403 Forbidden is expected without auth)`);
      console.log(`   ✅ NO REDIRECT ERRORS - Request completed successfully!`);
    } else {
      console.log(`   ⚠️  Status code: ${response.status}`);
    }
  } catch (error) {
    console.error(`   ❌ ERROR: ${error.message}`);
    if (error.message.includes('redirect')) {
      console.error(`   🔴 REDIRECT ERROR DETECTED!`);
      console.error(`   Code: ${error.code}`);
      if (error.config) {
        console.error(`   Config:`, {
          url: error.config.url,
          method: error.config.method,
          maxRedirects: error.config.maxRedirects,
        });
      }
      if (error.response) {
        console.error(`   Response:`, {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
        });
      }
      console.error(`   Stack: ${error.stack}`);
    } else {
      console.error(`   Full error:`, error);
    }
  }

  // Test 2: Test POST request to /orders endpoint (like order submission)
  console.log('\n2. Testing axios POST to /orders endpoint (simulating order submission)...');
  try {
    const axiosInstance = axios.create({
      httpsAgent: agent,
      httpAgent: agent,
      maxRedirects: 100,
      timeout: 30000,
      validateStatus: () => true,
    });

    // Try POST to /orders endpoint (will fail auth but should not redirect)
    const response = await axiosInstance.post(`${CLOB_API_URL}/orders`, {
      test: 'data'
    }, {
      httpsAgent: agent,
      httpAgent: agent,
      maxRedirects: 100,
      validateStatus: () => true,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Final URL: ${response.request?.res?.responseUrl || response.config?.url}`);
    console.log(`   Request URL: ${response.config?.url}`);
    console.log(`   Redirect count: ${response.request?._redirectCount || 0}`);
    
    // We expect a 401, 403, or 400, not a redirect error
    if (response.status >= 400 && response.status < 500) {
      console.log('   ✅ SUCCESS: POST request reached CLOB API (got expected error response)');
      console.log(`   ✅ NO REDIRECT ERRORS - Request completed successfully!`);
      console.log(`   Response: ${JSON.stringify(response.data).substring(0, 200)}`);
    } else if (response.status === 200) {
      console.log('   ✅ SUCCESS: POST request succeeded!');
    } else {
      console.log(`   ⚠️  Unexpected status: ${response.status}`);
    }
  } catch (error) {
    console.error(`   ❌ ERROR: ${error.message}`);
    if (error.message.includes('redirect')) {
      console.error(`   🔴 REDIRECT ERROR ON POST: ${error.message}`);
      console.error(`   This indicates the proxy is causing redirect loops!`);
      console.error(`   Code: ${error.code}`);
      if (error.config) {
        console.error(`   Config maxRedirects: ${error.config.maxRedirects}`);
        console.error(`   Request URL: ${error.config.url}`);
        console.error(`   Request method: ${error.config.method}`);
      }
      if (error.response) {
        console.error(`   Response status: ${error.response.status}`);
        console.error(`   Response headers:`, error.response.headers);
        console.error(`   Response data:`, JSON.stringify(error.response.data).substring(0, 200));
      }
      if (error.request) {
        console.error(`   Request path: ${error.request.path}`);
        console.error(`   Request method: ${error.request.method}`);
      }
    } else {
      console.error(`   Full error:`, error);
    }
  }

  // Test 3: Test GET /markets endpoint (public endpoint)
  console.log('\n3. Testing axios GET to /markets endpoint (public endpoint)...');
  try {
    const axiosInstance = axios.create({
      httpsAgent: agent,
      httpAgent: agent,
      maxRedirects: 100,
      timeout: 30000,
      validateStatus: () => true,
    });

    // Try to get a market (will fail with 404 for invalid market, but should not redirect)
    const response = await axiosInstance.get(`${CLOB_API_URL}/markets/invalid-market-slug`, {
      httpsAgent: agent,
      httpAgent: agent,
      maxRedirects: 100,
      validateStatus: () => true,
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Request URL: ${response.config?.url}`);
    console.log(`   Redirect count: ${response.request?._redirectCount || 0}`);
    
    if (response.status === 404 || response.status === 400) {
      console.log('   ✅ SUCCESS: GET request reached CLOB API (got expected error for invalid market)');
      console.log(`   ✅ NO REDIRECT ERRORS - Request completed successfully!`);
    } else if (response.status === 403) {
      console.log(`   ✅ SUCCESS: Reached CLOB API (403 Forbidden is expected without auth)`);
      console.log(`   ✅ NO REDIRECT ERRORS - Request completed successfully!`);
    } else if (response.status === 200) {
      console.log('   ✅ SUCCESS: GET request succeeded!');
    } else {
      console.log(`   ⚠️  Status code: ${response.status}`);
    }
  } catch (error) {
    console.error(`   ❌ ERROR: ${error.message}`);
    if (error.message.includes('redirect')) {
      console.error(`   🔴 REDIRECT ERROR ON GET /markets: ${error.message}`);
      console.error(`   Code: ${error.code}`);
      if (error.config) {
        console.error(`   Config maxRedirects: ${error.config.maxRedirects}`);
        console.error(`   Request URL: ${error.config.url}`);
      }
    }
  }

  // Test 4: Check IP through proxy
  console.log('\n4. Checking IP address through proxy...');
  try {
    const axiosInstance = axios.create({
      httpsAgent: agent,
      httpAgent: agent,
      maxRedirects: 100,
      timeout: 30000,
    });

    const response = await axiosInstance.get('https://api.ipify.org?format=json');
    console.log(`   IP Address: ${response.data.ip}`);
    console.log(`   ✅ Proxy is routing traffic`);
  } catch (error) {
    console.error(`   ❌ ERROR: ${error.message}`);
  }

  console.log('\n✅ Axios testing completed!\n');
}

testAxios().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

