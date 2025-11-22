#!/usr/bin/env node
/**
 * Test proxy connection from inside Docker container
 */
import { HttpsProxyAgent } from 'https-proxy-agent';
import https from 'https';

async function testProxy() {
  console.log('\n🔍 Testing Proxy Connection...\n');
  
  const proxyUrl = process.env.CLOB_PROXY_URL || 'http://host.docker.internal:8080';
  console.log(`Proxy URL: ${proxyUrl}`);
  
  // Test 1: Direct connection (should show server IP)
  console.log('\n1. Testing direct connection (no proxy)...');
  try {
    const directResponse = await fetch('https://api.ipify.org?format=json');
    const directData = await directResponse.json();
    console.log(`   IP: ${directData.ip}`);
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
  
  // Test 2: With proxy agent
  console.log('\n2. Testing with proxy agent...');
  try {
    const agent = new HttpsProxyAgent(proxyUrl);
    const proxyResponse = await fetch('https://api.ipify.org?format=json', {
      // @ts-ignore
      agent: agent,
    });
    const proxyData = await proxyResponse.json();
    console.log(`   IP: ${proxyData.ip}`);
    
    if (proxyData.ip !== '178.128.186.64') {
      console.log('   ✅ SUCCESS: Proxy is working! IP is different from server.');
    } else {
      console.log('   ⚠️  WARNING: IP matches server IP. Proxy may not be working.');
    }
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    console.log(`   Details: ${error instanceof Error ? error.stack : ''}`);
  }
  
  // Test 3: Using https.request directly
  console.log('\n3. Testing with https.request (what axios uses)...');
  try {
    const agent = new HttpsProxyAgent(proxyUrl);
    const options = {
      hostname: 'api.ipify.org',
      path: '/?format=json',
      agent: agent,
    };
    
    await new Promise<void>((resolve, reject) => {
      https.get(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            console.log(`   IP: ${result.ip}`);
            if (result.ip !== '178.128.186.64') {
              console.log('   ✅ SUCCESS: Proxy is working via https.request!');
            } else {
              console.log('   ⚠️  WARNING: Still using server IP.');
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  } catch (error) {
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
  
  console.log('\n');
}

testProxy().catch(console.error);

