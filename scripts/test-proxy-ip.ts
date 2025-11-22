#!/usr/bin/env node
/**
 * Test script to verify proxy is working and what IP is being used
 */
import { config } from '../src/config/env';
import { getClobProxyAgent, isClobProxyEnabled } from '../src/utils/proxy-agent';

async function testProxyIP() {
  console.log('\n🔍 Testing Proxy Configuration...\n');
  
  console.log('Configuration:');
  console.log(`  CLOB_PROXY_URL: ${config.proxy?.clobProxyUrl || '(not set)'}`);
  console.log(`  PROXY_ENABLED: ${config.proxy?.enabled || false}`);
  console.log(`  CLOB Proxy Enabled: ${isClobProxyEnabled()}`);
  
  const agent = getClobProxyAgent();
  console.log(`  Proxy Agent: ${agent ? 'Created' : 'Not created'}`);
  
  if (!agent) {
    console.log('\n❌ Proxy agent not created. Check configuration.');
    return;
  }
  
  console.log('\n📡 Testing IP detection...');
  
  // Test 1: Direct fetch (should use server IP)
  try {
    const directResponse = await fetch('https://api.ipify.org?format=json');
    const directData = await directResponse.json();
    console.log(`  Direct IP (server): ${directData.ip}`);
  } catch (error) {
    console.log(`  Direct IP test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Test 2: With proxy agent (should use proxy IP)
  try {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    const proxyAgent = new HttpsProxyAgent(config.proxy?.clobProxyUrl || '');
    
    // @ts-ignore
    const proxyResponse = await fetch('https://api.ipify.org?format=json', {
      agent: proxyAgent,
    });
    const proxyData = await proxyResponse.json();
    console.log(`  Proxy IP (via agent): ${proxyData.ip}`);
    
    if (proxyData.ip !== '178.128.186.64') {
      console.log('  ✅ Proxy is working! IP is different from server IP.');
    } else {
      console.log('  ⚠️  Warning: Proxy IP matches server IP. Proxy may not be working.');
    }
  } catch (error) {
    console.log(`  Proxy IP test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Test 3: Check if HTTP_PROXY env var is set
  console.log('\n📋 Environment Variables:');
  console.log(`  HTTP_PROXY: ${process.env.HTTP_PROXY || '(not set)'}`);
  console.log(`  HTTPS_PROXY: ${process.env.HTTPS_PROXY || '(not set)'}`);
}

testProxyIP().catch(console.error);

