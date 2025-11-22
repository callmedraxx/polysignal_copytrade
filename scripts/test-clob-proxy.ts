#!/usr/bin/env node
/**
 * Test CLOB API connection through proxy
 * This script tests if the proxy can reach clob.polymarket.com and checks for redirect issues
 */

import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import axios from 'axios';
import { config } from '../src/config/env';

async function testClobProxy() {
  console.log('\n🔍 Testing CLOB API Connection Through Proxy...\n');
  
  const proxyUrl = config.proxy?.clobProxyUrl || process.env.CLOB_PROXY_URL;
  
  if (!proxyUrl) {
    console.error('❌ CLOB_PROXY_URL is not set!');
    console.log('Please set CLOB_PROXY_URL in your .env file');
    process.exit(1);
  }
  
  console.log(`Proxy URL: ${proxyUrl}`);
  console.log(`Target: https://clob.polymarket.com\n`);
  
  // Create proxy agent
  let agent: any;
  try {
    if (proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks5h://') || proxyUrl.startsWith('socks://')) {
      agent = new SocksProxyAgent(proxyUrl);
      console.log('✅ Created SOCKS5 proxy agent');
    } else {
      agent = new HttpsProxyAgent(proxyUrl, {
        rejectUnauthorized: false, // Disable SSL verification for proxy
      });
      console.log('✅ Created HTTPS proxy agent');
    }
  } catch (error) {
    console.error('❌ Failed to create proxy agent:', error);
    process.exit(1);
  }
  
  // Test 1: Direct https.request to CLOB API health endpoint
  console.log('\n1. Testing https.request to CLOB API /health endpoint...');
  try {
    const options: any = {
      hostname: 'clob.polymarket.com',
      path: '/health',
      method: 'GET',
      agent: agent,
      rejectUnauthorized: false, // Disable SSL verification
      checkServerIdentity: () => undefined,
    };
    
    await new Promise<void>((resolve, reject) => {
      const req = https.request(options, (res) => {
        console.log(`   Status: ${res.statusCode} ${res.statusMessage}`);
        console.log(`   Headers:`, res.headers);
        
        let data = '';
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => {
          console.log(`   Response: ${data.substring(0, 200)}`);
          if (res.statusCode === 200) {
            console.log('   ✅ SUCCESS: CLOB API is reachable through proxy!');
          } else {
            console.log(`   ⚠️  WARNING: Unexpected status code ${res.statusCode}`);
          }
          resolve();
        });
      });
      
      req.on('error', (error) => {
        console.error(`   ❌ ERROR: ${error.message}`);
        if (error.message.includes('redirect')) {
          console.error(`   🔴 REDIRECT ERROR DETECTED: ${error.message}`);
          console.error(`   Stack: ${error.stack}`);
        }
        reject(error);
      });
      
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout after 30 seconds'));
      });
      
      req.end();
    });
  } catch (error: any) {
    console.error(`   ❌ ERROR: ${error.message}`);
    if (error.message.includes('redirect')) {
      console.error(`   🔴 REDIRECT ERROR: ${error.message}`);
      console.error(`   Code: ${error.code}`);
      console.error(`   Stack: ${error.stack}`);
    }
  }
  
  // Test 2: Using axios with proxy agent
  console.log('\n2. Testing axios with proxy agent (with maxRedirects=100)...');
  try {
    // Configure axios to use the proxy agent and high redirect limit
    const axiosInstance = axios.create({
      httpsAgent: agent,
      httpAgent: agent,
      maxRedirects: 100,
      timeout: 30000,
      validateStatus: () => true, // Don't throw on any status
    });
    
    // Disable SSL verification
    axiosInstance.defaults.httpsAgent = agent;
    axiosInstance.defaults.httpAgent = agent;
    
    const response = await axiosInstance.get('https://clob.polymarket.com/health', {
      httpsAgent: agent,
      httpAgent: agent,
      maxRedirects: 100,
      validateStatus: () => true,
    });
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Headers:`, response.headers);
    console.log(`   Data: ${JSON.stringify(response.data).substring(0, 200)}`);
    
    if (response.status === 200) {
      console.log('   ✅ SUCCESS: Axios can reach CLOB API through proxy!');
    } else {
      console.log(`   ⚠️  WARNING: Unexpected status code ${response.status}`);
    }
  } catch (error: any) {
    console.error(`   ❌ ERROR: ${error.message}`);
    if (error.message.includes('redirect')) {
      console.error(`   🔴 REDIRECT ERROR: ${error.message}`);
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
  
  // Test 3: Test a POST request (like order submission)
  console.log('\n3. Testing POST request to CLOB API (simulating order submission)...');
  try {
    const axiosInstance = axios.create({
      httpsAgent: agent,
      httpAgent: agent,
      maxRedirects: 100,
      timeout: 30000,
      validateStatus: () => true,
    });
    
    // Try to POST to a non-existent endpoint to see redirect behavior
    const response = await axiosInstance.post('https://clob.polymarket.com/orders', {
      test: 'data'
    }, {
      httpsAgent: agent,
      httpAgent: agent,
      maxRedirects: 100,
      validateStatus: () => true,
    });
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Headers:`, Object.keys(response.headers));
    
    // We expect a 401 or 400, not a redirect error
    if (response.status >= 400 && response.status < 500) {
      console.log('   ✅ SUCCESS: POST request reached CLOB API (got expected error response)');
    } else if (response.status === 200) {
      console.log('   ✅ SUCCESS: POST request succeeded!');
    } else {
      console.log(`   ⚠️  Unexpected status: ${response.status}`);
    }
  } catch (error: any) {
    console.error(`   ❌ ERROR: ${error.message}`);
    if (error.message.includes('redirect')) {
      console.error(`   🔴 REDIRECT ERROR ON POST: ${error.message}`);
      console.error(`   This indicates the proxy is causing redirect loops!`);
      console.error(`   Code: ${error.code}`);
      if (error.config) {
        console.error(`   Config maxRedirects: ${error.config.maxRedirects}`);
      }
    }
  }
  
  // Test 4: Check what IP we're using
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
  } catch (error: any) {
    console.error(`   ❌ ERROR: ${error.message}`);
  }
  
  console.log('\n✅ Proxy testing completed!\n');
}

testClobProxy().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

