#!/usr/bin/env node
/**
 * Simple SOCKS5 proxy server for local machine
 * Routes traffic through the local machine's internet connection
 * 
 * Usage: node local-socks5-proxy.js
 * Then use: socks5://127.0.0.1:8080
 */
const net = require('net');
const dns = require('dns');

const PROXY_PORT = process.env.PROXY_PORT || 8080;

// SOCKS5 constants
const SOCKS5_VERSION = 0x05;
const AUTH_METHOD_NO_AUTH = 0x00;
const AUTH_METHOD_NOT_ACCEPTABLE = 0xff;
const CMD_CONNECT = 0x01;
const ADDR_TYPE_IPV4 = 0x01;
const ADDR_TYPE_DOMAIN = 0x03;
const REPLY_SUCCESS = 0x00;
const REPLY_GENERAL_FAILURE = 0x01;

function createSocks5Proxy() {
  const server = net.createServer((clientSocket) => {
    let state = 'handshake';
    let handshakeBuffer = Buffer.alloc(0);
    let requestBuffer = Buffer.alloc(0);
    let targetSocket = null;
    
    const dataHandler = (data) => {
      if (state === 'handshake') {
        handshakeBuffer = Buffer.concat([handshakeBuffer, data]);
        
        if (handshakeBuffer.length >= 2) {
          const version = handshakeBuffer[0];
          const nMethods = handshakeBuffer[1];
          
          if (version !== SOCKS5_VERSION) {
            clientSocket.destroy();
            return;
          }
          
          if (handshakeBuffer.length >= 2 + nMethods) {
            // Send response: no authentication required
            const response = Buffer.from([SOCKS5_VERSION, AUTH_METHOD_NO_AUTH]);
            clientSocket.write(response);
            state = 'request';
            handshakeBuffer = Buffer.alloc(0);
          }
        }
      } else if (state === 'request') {
        requestBuffer = Buffer.concat([requestBuffer, data]);
        
        // Need at least 4 bytes to read version, cmd, rsv, addrType
        if (requestBuffer.length < 4) {
          return; // Need more data
        }
        
        const version = requestBuffer[0];
        const cmd = requestBuffer[1];
        const rsv = requestBuffer[2];
        const addrType = requestBuffer[3];
        
        if (version !== SOCKS5_VERSION) {
          const errorResponse = Buffer.from([
            SOCKS5_VERSION, REPLY_GENERAL_FAILURE, 0x00,
            ADDR_TYPE_IPV4, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
          ]);
          clientSocket.write(errorResponse);
          clientSocket.destroy();
          return;
        }
        
        if (cmd !== CMD_CONNECT) {
          const errorResponse = Buffer.from([
            SOCKS5_VERSION, REPLY_GENERAL_FAILURE, 0x00,
            ADDR_TYPE_IPV4, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
          ]);
          clientSocket.write(errorResponse);
          clientSocket.destroy();
          return;
        }
        
        let targetHost;
        let targetPort;
        let minLength = 4;
        
        if (addrType === ADDR_TYPE_IPV4) {
          minLength = 10; // version(1) + cmd(1) + rsv(1) + addrType(1) + ip(4) + port(2)
          if (requestBuffer.length < minLength) {
            return; // Need more data
          }
          targetHost = `${requestBuffer[4]}.${requestBuffer[5]}.${requestBuffer[6]}.${requestBuffer[7]}`;
          targetPort = (requestBuffer[8] << 8) | requestBuffer[9];
        } else if (addrType === ADDR_TYPE_DOMAIN) {
          if (requestBuffer.length < 5) {
            return; // Need more data
          }
          const domainLength = requestBuffer[4];
          minLength = 5 + domainLength + 2; // version(1) + cmd(1) + rsv(1) + addrType(1) + len(1) + domain(n) + port(2)
          if (requestBuffer.length < minLength) {
            return; // Need more data
          }
          targetHost = requestBuffer.slice(5, 5 + domainLength).toString('utf8');
          targetPort = (requestBuffer[5 + domainLength] << 8) | requestBuffer[5 + domainLength + 1];
        } else {
          const errorResponse = Buffer.from([
            SOCKS5_VERSION, REPLY_GENERAL_FAILURE, 0x00,
            ADDR_TYPE_IPV4, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
          ]);
          clientSocket.write(errorResponse);
          clientSocket.destroy();
          return;
        }
        
        // Resolve hostname if needed and connect to target
        const connectToTarget = (host, port) => {
          targetSocket = net.createConnection(port, host, () => {
            // Send success response
            const response = Buffer.from([
              SOCKS5_VERSION, REPLY_SUCCESS, 0x00,
              ADDR_TYPE_IPV4, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
            ]);
            clientSocket.write(response);
            
            // Remove the data handler - pipes will handle data now
            clientSocket.removeListener('data', dataHandler);
            
            // Pipe data bidirectionally
            clientSocket.pipe(targetSocket);
            targetSocket.pipe(clientSocket);
            
            state = 'connected';
          });
          
          targetSocket.on('error', (err) => {
            console.error(`Connection error to ${host}:${port}:`, err.message);
            const errorResponse = Buffer.from([
              SOCKS5_VERSION, REPLY_GENERAL_FAILURE, 0x00,
              ADDR_TYPE_IPV4, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
            ]);
            if (!clientSocket.destroyed) {
              clientSocket.write(errorResponse);
              clientSocket.destroy();
            }
          });
          
          const cleanup = () => {
            if (targetSocket && !targetSocket.destroyed) {
              targetSocket.destroy();
            }
          };
          
          clientSocket.on('error', cleanup);
          clientSocket.on('close', cleanup);
          targetSocket.on('close', () => {
            if (!clientSocket.destroyed) {
              clientSocket.destroy();
            }
          });
        };
        
        // Connect to target (resolve DNS if domain)
        if (addrType === ADDR_TYPE_DOMAIN) {
          dns.lookup(targetHost, (err, address) => {
            if (err) {
              const errorResponse = Buffer.from([
                SOCKS5_VERSION, REPLY_GENERAL_FAILURE, 0x00,
                ADDR_TYPE_IPV4, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
              ]);
              if (!clientSocket.destroyed) {
                clientSocket.write(errorResponse);
                clientSocket.destroy();
              }
              return;
            }
            connectToTarget(address, targetPort);
          });
        } else {
          connectToTarget(targetHost, targetPort);
        }
      }
    };
    
    clientSocket.on('data', dataHandler);
    clientSocket.on('error', () => {
      if (targetSocket && !targetSocket.destroyed) {
        targetSocket.destroy();
      }
    });
  });
  
  server.listen(PROXY_PORT, '127.0.0.1', () => {
    console.log(`✅ SOCKS5 proxy running on 127.0.0.1:${PROXY_PORT}`);
    console.log(`   Traffic will route through your local machine's IP`);
    console.log(`   Use: socks5://127.0.0.1:${PROXY_PORT}`);
  });
  
  server.on('error', (err) => {
    console.error('Server error:', err.message);
    process.exit(1);
  });
}

createSocks5Proxy();

