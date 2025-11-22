#!/usr/bin/env node
/**
 * Simple proxy test using Node.js built-in modules
 * Can be run directly with: node scripts/test-proxy-simple.js
 */

const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const proxyUrl = process.env.CLOB_PROXY_URL;

if (!proxyUrl) {
  console.error('❌ CLOB_PROXY_URL is not set!');
  process.exit(1);
}

console.log('🔍 Testing Proxy Connection...\n');
console.log(`Proxy URL: ${proxyUrl}`);
console.log(`Target: https://clob.polymarket.com\n`);

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

// Test 1: Simple GET request
console.log('\n1. Testing GET request to /health endpoint...');
const options = {
  hostname: 'clob.polymarket.com',
  path: '/health',
  method: 'GET',
  agent: agent,
  rejectUnauthorized: false,
  checkServerIdentity: () => undefined,
  timeout: 30000,
};

const req = https.request(options, (res) => {
  console.log(`   Status: ${res.statusCode} ${res.statusMessage}`);
  console.log(`   Headers:`, Object.keys(res.headers));
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk.toString();
  });
  
  res.on('end', () => {
    console.log(`   Response: ${data.substring(0, 200)}`);
    if (res.statusCode === 200) {
      console.log('   ✅ SUCCESS: CLOB API is reachable through proxy!');
    } else {
      console.log(`   ⚠️  Status code: ${res.statusCode}`);
    }
    console.log('\n✅ Test completed!');
  });
});

req.on('error', (error) => {
  console.error(`   ❌ ERROR: ${error.message}`);
  if (error.message.includes('redirect')) {
    console.error(`   🔴 REDIRECT ERROR DETECTED!`);
    console.error(`   Code: ${error.code}`);
    console.error(`   This indicates the proxy is causing redirect loops.`);
  }
  console.error(`   Stack: ${error.stack}`);
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  console.error('   ❌ Request timeout after 30 seconds');
  process.exit(1);
});

req.end();

