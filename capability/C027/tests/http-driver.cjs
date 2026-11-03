'use strict';

const http = require('node:http');
const assert = require('node:assert/strict');
const { listenerOrigin } = require('../server.cjs');

async function until(predicate, message = 'Expected live stream observation', timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function streamUrl(server, conductor, overrides = {}) {
  const origin = listenerOrigin(server);
  assert.equal(conductor.origin, origin);
  const url = new URL(conductor.endpoint);
  assert.equal(url.origin, origin, 'Only this exact owned handle/port may be contacted.');
  url.search = new URLSearchParams({
    profileId: 'synthetic-001', version: 'r1', after: 'START', mode: 'normal', ...overrides
  });
  return url;
}

function openStream(server, conductor, overrides = {}, headers = {}) {
  const url = streamUrl(server, conductor, overrides);
  return new Promise((resolve, reject) => {
    const request = http.get(url, { agent: false, headers }, (response) => {
      const observed = {
        status: response.statusCode, headers: response.headers,
        frames: [], chunks: [], ended: false, closed: false, aborted: false,
        close: () => { response.destroy(); request.destroy(); }
      };
      let pending = '';
      response.on('data', (bytes) => {
        const receivedAt = Date.now();
        observed.chunks.push({ bytes: Buffer.from(bytes), receivedAt });
        pending += bytes.toString('utf8');
        let delimiter;
        while ((delimiter = pending.indexOf('\n\n')) !== -1) {
          const raw = pending.slice(0, delimiter + 2);
          pending = pending.slice(delimiter + 2);
          const fields = {};
          for (const line of raw.slice(0, -2).split('\n')) {
            const colon = line.indexOf(':');
            if (colon > 0) fields[line.slice(0, colon)] = line.slice(colon + 1).replace(/^ /, '');
          }
          observed.frames.push({ ...fields, raw, receivedAt });
        }
      });
      response.on('end', () => { observed.ended = true; });
      response.on('aborted', () => { observed.aborted = true; });
      response.on('error', (error) => { observed.error = error.code; });
      response.on('close', () => { observed.closed = true; });
      resolve(observed);
    });
    request.setTimeout(8000, () => request.destroy(new Error('Owned stream observation timed out.')));
    request.once('error', reject);
  });
}

function ordinaryRequest(server, url, options = {}) {
  assert.equal(new URL(url).origin, listenerOrigin(server), 'Do not probe foreign ports or listeners.');
  return new Promise((resolve, reject) => {
    const request = http.request(url, { agent: false, ...options }, (response) => {
      const bytes = [];
      response.on('data', (chunk) => bytes.push(chunk));
      response.once('error', reject);
      response.on('end', () => resolve({
        status: response.statusCode, headers: response.headers, bytes: Buffer.concat(bytes),
        value: bytes.length ? JSON.parse(Buffer.concat(bytes).toString('utf8')) : null
      }));
    });
    request.setTimeout(5000, () => request.destroy(new Error('Owned HTTP request timed out.')));
    request.once('error', reject);
    request.end(options.body);
  });
}

module.exports = Object.freeze({ until, streamUrl, openStream, ordinaryRequest });
