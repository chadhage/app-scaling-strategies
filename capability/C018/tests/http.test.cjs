'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startInspection, csp, maximumLifetimeMs } = require('..\\server.cjs');
const { newFixture } = require('./fixture.cjs');
const { request } = require('./http-client.cjs');

test('actual owned ephemeral HTTP routes preserve source bytes and reject writes, foreign authorities, unknown paths and redirects', async (t) => {
  const fixture = newFixture();
  let host;
  try {
    host = await startInspection(fixture.namespace);
    assert.equal(host.probe.allowed, true);
    assert.equal(host.probe.executed, false);
    assert.equal(host.server.address().address, '127.0.0.1');
    assert.equal(host.server.address().family, 'IPv4');
    assert.equal(maximumLifetimeMs <= 15 * 60 * 1000, true);
    for (const [route, name] of [['/', 'index.html'], ['/app.js', 'app.js'], ['/inspection.js', 'inspection.js'], ['/styles.css', 'styles.css']]) {
      const response = await request(host.url, route);
      assert.equal(response.status, 200);
      assert.deepEqual(response.bytes, fs.readFileSync(path.resolve(__dirname, '..', name)));
      assert.equal(response.headers['content-security-policy'], csp);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers.location, undefined);
    }
    const head = await request(host.url, '/', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.bytes.length, 0);
    const missing = await request(host.url, '/api/runs/synthetic-run-001');
    assert.equal(missing.status, 404);
    assert.equal(JSON.parse(missing.bytes).code, 'STATE_MISSING');
    assert.equal(fs.existsSync(fixture.location.root), false);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const denied = await request(host.url, '/api/runs/synthetic-run-001', { method });
      assert.equal(denied.status, 405);
      assert.equal(JSON.parse(denied.bytes).code, 'READ_ONLY');
    }
    for (const foreign of ['localhost:1', 'example.invalid:1', '127.0.0.1:1']) {
      assert.equal((await request(host.url, '/', { headers: { Host: foreign } })).status, 421);
    }
    for (const foreign of ['null', 'http://localhost:1', 'http://127.0.0.1:1', 'https://example.invalid']) {
      assert.equal((await request(host.url, '/', { headers: { Origin: foreign } })).status, 403);
    }
    assert.equal((await request(host.url, '/', { headers: { Origin: host.url } })).status, 200);
    for (const route of ['/redirect', '/api/reset', '/api/runs', '/api/runs/', '/..\\C015\\store.cjs', '/%2e%2e/C015/store.cjs', '/?run=synthetic-run-001']) {
      const denied = await request(host.url, route);
      assert.equal([400, 404].includes(denied.status), true, route);
      assert.equal(denied.headers.location, undefined);
    }
    const unknown = await request(host.url, '/api/runs/synthetic-run-003');
    assert.equal(unknown.status, 400);
    assert.equal(JSON.parse(unknown.bytes).restored, false);
    assert.equal(JSON.parse(unknown.bytes).code, 'UNKNOWN_RUN_ID');
    t.diagnostic(JSON.stringify({ observation: 'actual-node-HTTP-not-browser-TCP-proof', origin: host.url,
      currentMutexReadC001Probe: host.probe, missing: JSON.parse(missing.bytes), requests: host.requests }));
  } finally {
    if (host) {
      await host.close();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(host.server.listening, false);
      assert.equal(host.server.address(), null);
      assert.equal(host.socketCount(), 0);
      assert.equal(host.server.listenerCount('request'), 0);
      assert.equal(host.server.listenerCount('connection'), 0);
    }
    await fixture.cleanup();
  }
});
