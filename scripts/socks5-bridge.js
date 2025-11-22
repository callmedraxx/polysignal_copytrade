#!/usr/bin/env node
/**
 * SOCKS5 bridge to make SSH SOCKS5 tunnel accessible from Docker containers
 * Runs on host and forwards SOCKS5 requests from 0.0.0.0:8081 to 127.0.0.1:8080
 */
const net = require('net');
const { SocksClient } = require('socks');

const BRIDGE_PORT = 8081;
const TUNNEL_PORT = 8080;
const TUNNEL_HOST = '127.0.0.1';

console.log(`Starting SOCKS5 bridge on port ${BRIDGE_PORT} -> ${TUNNEL_HOST}:${TUNNEL_PORT}`);
console.log(`Docker containers should use: socks5://host.docker.internal:${BRIDGE_PORT}`);

const server = net.createServer((clientSocket) => {
  // Read SOCKS5 handshake from client
  let handshakeBuffer = Buffer.alloc(0);
  
  clientSocket.on('data', async (data) => {
    handshakeBuffer = Buffer.concat([handshakeBuffer, data]);
    
    // Forward to the SSH tunnel SOCKS5 proxy
    const tunnelSocket = new net.Socket();
    
    tunnelSocket.connect(TUNNEL_PORT, TUNNEL_HOST, () => {
      // Forward all data to tunnel
      tunnelSocket.write(handshakeBuffer);
      
      // Pipe data bidirectionally
      clientSocket.pipe(tunnelSocket);
      tunnelSocket.pipe(clientSocket);
      
      // Handle errors
      clientSocket.on('error', () => tunnelSocket.destroy());
      tunnelSocket.on('error', () => clientSocket.destroy());
      
      clientSocket.on('close', () => tunnelSocket.destroy());
      tunnelSocket.on('close', () => clientSocket.destroy());
    });
    
    tunnelSocket.on('error', (err) => {
      console.error('Tunnel connection error:', err.message);
      clientSocket.destroy();
    });
  });
  
  clientSocket.on('error', (err) => {
    console.error('Client error:', err.message);
  });
});

server.listen(BRIDGE_PORT, '0.0.0.0', () => {
  console.log(`✅ SOCKS5 bridge running on 0.0.0.0:${BRIDGE_PORT}`);
  console.log(`   Forwarding to ${TUNNEL_HOST}:${TUNNEL_PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err.message);
  process.exit(1);
});

