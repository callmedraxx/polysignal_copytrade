#!/usr/bin/env node
/**
 * Script to verify CLOB_PROXY_URL is being read correctly from environment
 */
import { config } from '../src/config/env';

console.log('🔍 Checking Proxy Configuration...\n');

console.log('Proxy Configuration:');
console.log('===================');
console.log(`PROXY_ENABLED: ${config.proxy?.enabled || false}`);
console.log(`PROXY_URL: ${config.proxy?.url || '(not set)'}`);
console.log(`CLOB_PROXY_URL: ${config.proxy?.clobProxyUrl || '(not set)'}`);
console.log(`\nOxylabs Configuration:`);
console.log(`OXYLABS_USERNAME: ${config.proxy?.oxylabs?.username || '(not set)'}`);
console.log(`OXYLABS_PASSWORD: ${config.proxy?.oxylabs?.password ? '***' : '(not set)'}`);
console.log(`OXYLABS_PROXY_TYPE: ${config.proxy?.oxylabs?.proxyType || '(not set)'}`);
console.log(`OXYLABS_USE_DATACENTER: ${config.proxy?.oxylabs?.useDatacenter || false}`);
console.log(`OXYLABS_COUNTRY: ${config.proxy?.oxylabs?.country || '(not set)'}`);

console.log('\n✅ Configuration Check Complete');
console.log('\nProxy Status:');
if (config.proxy?.clobProxyUrl) {
  console.log('  ✅ CLOB_PROXY_URL is set - CLOB orders will use this proxy');
} else if (config.proxy?.enabled && (config.proxy?.url || config.proxy?.oxylabs?.username)) {
  console.log('  ✅ General proxy is configured - CLOB orders will use general proxy');
} else {
  console.log('  ⚠️  No proxy configured - CLOB orders will use server IP directly');
}

