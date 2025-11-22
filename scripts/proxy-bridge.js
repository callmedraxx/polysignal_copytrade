#!/usr/bin/env node
/**
 * Proxy bridge to make SSH tunnel accessible from Docker containers
 * Runs on host and forwards requests from 0.0.0.0:8081 to 127.0.0.1:8080
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

const BRIDGE_PORT = 8081;
const TUNNEL_PORT = 8080;
const TUNNEL_HOST = '127.0.0.1';

console.log(`Starting proxy bridge on port ${BRIDGE_PORT} -> ${TUNNEL_HOST}:${TUNNEL_PORT}`);
console.log(`Docker containers should use: http://host.docker.internal:${BRIDGE_PORT}`);

const server = http.createServer((clientReq, clientRes) => {
  // Handle CONNECT method for HTTPS tunneling
  if (clientReq.method === 'CONNECT') {
    const url = new URL(`http://${clientReq.url}`);
    const targetHost = url.hostname;
    const targetPort = url.port || 443;
    
    console.log(`CONNECT ${targetHost}:${targetPort}`);
    
    // Connect to the SSH tunnel proxy
    const proxyReq = http.request({
      hostname: TUNNEL_HOST,
      port: TUNNEL_PORT,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers: clientReq.headers,
    });
    
    proxyReq.on('connect', (proxyRes, socket, head) => {
      clientRes.writeHead(200, 'Connection Established');
      clientRes.end();
      socket.pipe(clientRes);
      clientRes.pipe(socket);
    });
    
    proxyReq.on('error', (err) => {
      console.error('CONNECT error:', err.message);
      clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
      clientRes.end('Proxy connection failed');
    });
    
    clientReq.pipe(proxyReq);
  } else {
    // Handle regular HTTP requests
    const options = {
      hostname: TUNNEL_HOST,
      port: TUNNEL_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers: clientReq.headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
      clientRes.end('Proxy connection failed: ' + err.message);
    });

    clientReq.pipe(proxyReq);
  }
});

server.listen(BRIDGE_PORT, '0.0.0.0', () => {
  console.log(`✅ Proxy bridge running on 0.0.0.0:${BRIDGE_PORT}`);
  console.log(`   Forwarding to ${TUNNEL_HOST}:${TUNNEL_PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err.message);
  process.exit(1);
});

