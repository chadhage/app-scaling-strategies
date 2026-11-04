'use strict';

const http = require('node:http');

function request(client, { target = '/', method = 'GET', headers = {}, body } = {}) {
  const address = client.server.address();
  if (!(client.server instanceof http.Server) || !client.server.listening || address?.address !== '127.0.0.1') {
    throw new Error('Tests require the actual caller-owned live IPv4 loopback http.Server.');
  }
  return new Promise((resolve, reject) => {
    const bytes = [];
    let size = 0;
    const req = http.request({
      hostname: '127.0.0.1', port: address.port, method, path: target,
      headers: { Connection: 'close', ...headers }, timeout: 4000, agent: false
    }, response => {
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 32768) { response.destroy(new Error('Test response exceeded the fixed local bound.')); return; }
        bytes.push(chunk);
      });
      response.once('error', reject);
      response.once('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(bytes) }));
    });
    req.once('timeout', () => req.destroy(new Error('Actual owned test HTTP request timed out.')));
    req.once('error', reject);
    req.end(body);
  });
}

module.exports = Object.freeze({ request });
