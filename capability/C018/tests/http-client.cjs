'use strict';

const http = require('node:http');

function request(origin, route, options = {}) {
  const url = new URL(origin);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('Only the exact own literal loopback HTTP origin is supported.');
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      hostname: '127.0.0.1', port: Number(url.port), path: route,
      method: options.method || 'GET', headers: options.headers || {}, timeout: 15000,
    }, (incoming) => {
      const chunks = [];
      incoming.on('data', (chunk) => chunks.push(chunk));
      incoming.on('end', () => resolve({ status: incoming.statusCode, headers: incoming.headers, bytes: Buffer.concat(chunks) }));
    });
    outgoing.on('error', reject);
    outgoing.on('timeout', () => outgoing.destroy(new Error('Owned HTTP request deadline exceeded.')));
    outgoing.end();
  });
}

module.exports = Object.freeze({ request });
