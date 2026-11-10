'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createLocalServer } = require('../server.cjs');
const { boot, doc } = require('./support.cjs');

class Socket extends EventEmitter {
  constructor() {
    super();
    this.remoteAddress = '127.0.0.1';
    this.writable = true;
    this.destroyed = false;
    this.sent = [];
  }
  destroy() { this.destroyed = true; this.emit('close'); }
  pause() { this.paused = true; }
  end(bytes, callback) { this.sent.push(bytes); callback?.(); }
}

class Response extends EventEmitter {
  constructor(socket) { super(); this.socket = socket; this.destroyed = false; this.writableEnded = false; }
  writeHead(status, headers) { this.statusCode = status; this.headers = headers; }
  writeContinue() { this.continued = true; }
  end(bytes) {
    this.bytes = bytes;
    this.writableEnded = true;
    this.emit('finish'); this.emit('close');
  }
}

async function fixture(context) {
  const { real, runner } = await boot();
  let handler;
  const transport = new EventEmitter();
  transport.address = () => ({ address: '127.0.0.1', port: 43210 });
  context.mock.method(http, 'createServer', (options, callback) => {
    handler = callback; transport.options = options; return transport;
  });
  const server = createLocalServer({ engine: real, runner, transcript: async () => ({ fixture: 'transcript' }) });
  let calls = 0;
  const request = async ({ url = '/v1/leases', method = 'GET', headers = {}, body, socket = new Socket(), event } = {}) => {
    const incoming = new EventEmitter();
    Object.assign(incoming, { url, method, headers: { host: '127.0.0.1:43210', ...headers }, socket });
    const response = new Response(socket);
    const work = event ? server.emit(event, incoming, response) : handler(incoming, response);
    // All collaborators and finite body chunks are injected; count actual settling turns, never elapsed time.
    for (let turn = 0; turn < 3; turn += 1) await Promise.resolve();
    if (body !== undefined) {
      for (const chunk of Array.isArray(body) ? body : [body]) incoming.emit('data', chunk);
      incoming.emit('end');
    }
    let settled = event !== undefined;
    let failure;
    Promise.resolve(work).then(() => { settled = true; }, (error) => { settled = true; failure = error; });
    for (let turn = 0; turn < 200; turn += 1) {
      calls += 1;
      if (settled && response.writableEnded) break;
      await Promise.resolve();
    }
    assert.equal(failure, undefined, 'a finite valid request must not reject');
    assert.equal(response.writableEnded, true, `finite request ${method} ${url} must answer after its injected work settles`);
    const json = String(response.headers?.['Content-Type']).startsWith('application/json')
      ? JSON.parse(response.bytes.toString('utf8')) : null;
    return { response, json, socket };
  };
  return { request, server, real, runner, workTurns: () => calls };
}

test('U060 generated finite route/status oracle observes every declared route and refusal without a socket wait', async (context) => {
  const f = await fixture(context);
  for (const url of ['/', '/page.js', '/styles.css', '/contract.js', '/validate.js', '/envelope.js', '/verify.js', '/c042-contract.js',
    '/scope.json', '/v1/leases', '/v1/journal', '/transcript.json', '/v1/presets']) {
    const answer = await f.request({ url });
    assert.equal(answer.response.statusCode, 200, url);
    assert.equal(Number(answer.response.headers['Content-Length']), answer.response.bytes.length, url);
  }
  const cases = [
    [{ url: '/absent' }, 404], [{ method: 'PUT', url: '/v1/leases' }, 405],
    [{ url: '/v1/leases?extra=1' }, 400], [{ headers: { host: 'foreign.invalid' } }, 421],
    [{ headers: { origin: 'http://foreign.invalid' } }, 403], [{ url: 'http://foreign.invalid/v1/leases' }, 400],
    [{ url: '/v1/leases#fragment' }, 400], [{ url: '/' + 'x'.repeat(2048) }, 414],
    [{ headers: { 'content-length': '1' } }, 400],
    [{ method: 'POST', url: '/v1/presets', headers: { 'content-type': 'text/plain' } }, 415],
    [{ url: '/v1/presets/x' }, 400], [{ url: '/v1/presets/missing-valid-key' }, 404],
    [{ method: 'POST', url: '/v1/presets/missing-valid-key/cancel', headers: { 'content-length': '1' } }, 400],
    [{ method: 'POST', url: '/v1/presets/missing-valid-key/not_valid' }, 404],
  ];
  for (const [options, expected] of cases) {
    const answer = await f.request(options);
    assert.equal(answer.response.statusCode, expected, JSON.stringify(options));
    assert.equal(answer.response.headers.Connection, 'close');
    assert.equal(answer.socket.destroyed, true);
  }
  assert.ok(f.workTurns() > 0);
});

test('U060 generated finite body oracle detects exact body limit, parsing and actual runner invocation', async (context) => {
  const f = await fixture(context);
  const bytes = Buffer.from(JSON.stringify(doc({ idempotencyKey: 'u060-generated-run-1' })));
  const valid = await f.request({ method: 'POST', url: '/v1/presets',
    headers: { 'content-type': 'application/json', 'content-length': String(bytes.length) }, body: bytes });
  assert.equal(valid.response.statusCode, 201);
  assert.equal(valid.json.outcome, 'succeeded');
  const oversized = await f.request({ method: 'POST', url: '/v1/presets',
    headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
    body: [Buffer.alloc(1024, 32), Buffer.alloc(1025, 32)] });
  assert.equal(oversized.response.statusCode, 413);
  assert.equal(oversized.socket.destroyed, true);
  const invalid = await f.request({ method: 'POST', url: '/v1/presets',
    headers: { 'content-type': 'application/json', 'content-length': '1' }, body: Buffer.from('{') });
  assert.equal(invalid.response.statusCode, 400);
});
