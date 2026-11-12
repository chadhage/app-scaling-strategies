'use strict';
const { test } = require('node:test');
const http = require('node:http'), net = require('node:net');
const { assert, fixture, request, login, world, denied, subject } = require('./kit.cjs');

test('all body and query refusals preserve accepted authority and business state', async () => {
  const f = await fixture();
  try {
    const member = await login(f);
    for (const [path, options, status, code] of [
      ['/candidate?q=x', {}, 400, 'QUERY_INVALID'],
      ['/candidate', { body: 'x' }, 400, 'UNEXPECTED_BODY'],
      ['/candidate/projects', { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } }, 415, 'MEDIA_TYPE_UNSUPPORTED'],
      ['/candidate/projects', { method: 'POST', body: '{broken' }, 400, 'BODY_INVALID_JSON'],
      ['/candidate/projects', { method: 'POST', body: 'x'.repeat(4097) }, 413, 'BODY_TOO_LARGE'],
      ['/candidate/projects', { method: 'POST', body: [] }, 400, 'BODY_NOT_OBJECT'],
      ['/candidate/projects', { method: 'POST', body: { name: 'good', units: 1, owner: 'ada' } }, 400, 'INPUT_UNKNOWN_FIELD'],
      ['/candidate/projects', { method: 'POST', body: { name: 'good' } }, 400, 'INPUT_MISSING_FIELD'],
      ['/candidate/projects', { method: 'POST', body: { name: 'good', units: 0 } }, 400, 'INPUT_INVALID'],
      ['/v1/session', { method: 'POST' }, 405, 'METHOD_NOT_ALLOWED']
    ]) {
      const before = world(f); denied(await request(f, path, { token: member.token, ...options }), status, code);
      assert.deepEqual(world(f), before, 'INPUT_REFUSAL_NO_EFFECT:' + code);
    }
    for (const units of [1, 100]) {
      const r = await request(f, '/candidate/projects', { method: 'POST', token: member.token, body: { name: 'bounded', units }, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
      assert.equal(r.status, 201, 'ACCEPTED_BODY_BOUND');
      assert.equal(r.json.project.units, units, 'BOUND_PRESERVED_NOT_COERCED');
    }
  } finally { await f.app.close(); }
});

test('public scope/bootstrap, frozen actual mount inventory and shipped network bounds are explicit', async () => {
  const f = await fixture();
  try {
    assert.equal(Object.isFrozen(subject.ROUTES), true, 'ACTUAL_MOUNTS_CANNOT_BE_MUTATED');
    assert.equal(subject.ROUTES.every(Object.isFrozen), true, 'EACH_MOUNT_IS_IMMUTABLE');
    assert.equal(Object.isFrozen(subject.SCOPE), true, 'PUBLIC_SCOPE_IMMUTABLE');
    assert.equal(new Set(subject.ROUTES.map(r => r.path)).size, subject.ROUTES.length, 'NO_UNACCOUNTED_DUPLICATE_DISPATCH');
    assert.deepEqual(f.app.health(), { ok: true, reason: null }, 'REAL_READING_STOP_AVAILABLE');
    assert.equal(f.app.queued(), 0, 'NO_PENDING_EFFECTS');
    assert.equal(f.app.server.requestTimeout, 5000, 'ACCEPTED_HEADER_TIMEOUT');
    assert.equal(f.app.server.headersTimeout, 5000, 'ACCEPTED_REQUEST_TIMEOUT');
    assert.equal(f.app.server.keepAliveTimeout, 1000, 'DECLARED_KEEPALIVE_BOUND');
    assert.equal(f.app.server.timeout, 8000, 'IDLE_AFTER_REQUEST_CHECK');
    assert.equal(f.app.server.maxConnections, 256, 'ACCEPTED_CONNECTION_CAP');
    for (const path of ['/', '/scope.json']) {
      const r = await request(f, path);
      assert.equal(r.status, 200, 'SCOPE_IS_NOT_CANDIDATE_DATA');
      assert.equal(r.json.cardId, 'C047', 'CORRECT_ORIGINAL_UNIT');
      assert.equal(r.json.mode, 'synthetic-offline-loopback', 'NO_NATIVE_CLOUD_CLAIM');
      assert.equal(r.json.previewAuthority, 'C022 project.create (current member/admin)', 'SANCTIONED_PERMISSION_DECLARED');
      assert.equal(r.json.cloudActions, false, 'NO_CLOUD_AUTHORITY');
      assert.equal(r.json.entraIntegrated, false, 'NO_INVENTED_IDENTITY_SYSTEM');
      assert.equal(r.json.liveAzureRuns, 0, 'NO_LIVE_RUNS');
      assert.equal(r.json.authorizedCloudSpend, 0, 'NO_SPEND');
      assert.deepEqual(r.json.routes, subject.ROUTES, 'PUBLIC_DOMAIN_IS_ACTUAL_DISPATCH_NOT_A_MOCK');
      assert.equal(r.headers['content-security-policy'], "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'", 'SANCTIONED_STRICT_CSP');
      assert.equal(r.headers['x-c009-scope'], 'synthetic-loopback-only', 'ACTUAL_IMPORTED_RESPONDER');
    }
    const first = f.app.close(); assert.equal(f.app.close(), first, 'REPEATED_CLOSE_REUSES_OWN_OPERATION'); await first;
    assert.equal(f.app.server.listening, false, 'OWN_LISTENER_CONFIRMED_CLOSED');
  } finally { await f.app.close(); }
});

test('actual reading-stop guard fails closed on a positively injected handle-less connection', () => {
  const app = subject.createApp();
  const socket = new net.Socket();
  const ownConnection = app.server.listeners('connection').at(-1);
  ownConnection(socket);
  assert.equal(socket.destroyed, true, 'HANDLE_LESS_CONNECTION_IS_DESTROYED');
  assert.deepEqual(app.health(), { ok: false, reason: 'READ_STOP_UNAVAILABLE' }, 'BROKEN_READING_STOP_FAILS_CLOSED');
});

test('actual startup reading-stop failure emits its typed error and records broken health', () => {
  const app = subject.createApp();
  let observed;
  app.server.once('error', error => { observed = error; });
  app.server.listeners('listening').at(-1)();
  assert.equal(observed?.message, 'READ_STOP_UNAVAILABLE', 'TYPED_STARTUP_READING_STOP_FAILURE');
  assert.deepEqual(app.health(), { ok: false, reason: 'READ_STOP_UNAVAILABLE' }, 'STARTUP_FAILURE_NOT_REPORTED_HEALTHY');
});

test('disconnected authorized candidate action cannot apply after its admission await', async () => {
  let reached, release;
  const entered = new Promise(r => { reached = r; }), resume = new Promise(r => { release = r; });
  const f = await fixture({ hooks: { afterAuthorize: async info => { if (info.candidate) { reached(); await resume; } } } });
  try {
    const member = await login(f), before = world(f);
    const bytes = JSON.stringify({ name: 'disconnected', units: 1 });
    const q = http.request(f.origin + '/candidate/projects', { method: 'POST', agent: false, headers: {
      Authorization: `Bearer ${member.token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes)
    } });
    q.on('error', () => {});
    q.end(bytes); await entered;
    const closed = new Promise(r => q.once('close', r)); q.destroy(); await closed;
    release();
    for (let n = 0; n < 5; n++) await new Promise(r => setImmediate(r));
    assert.deepEqual(world(f), before, 'DISCONNECTED_CANDIDATE_NO_COMMITTED_EFFECT');
  } finally { release(); await f.app.close(); }
});

test('disconnected authorized candidate action cannot apply after its final queued await', async () => {
  let reached, release;
  const entered = new Promise(r => { reached = r; }), resume = new Promise(r => { release = r; });
  const f = await fixture({ hooks: { beforeBoundary: async info => { if (info.candidate) { reached(); await resume; } } } });
  try {
    const member = await login(f), before = world(f);
    const bytes = JSON.stringify({ name: 'disconnected', units: 1 });
    const q = http.request(f.origin + '/candidate/projects', { method: 'POST', agent: false, headers: {
      Authorization: `Bearer ${member.token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes)
    } });
    q.on('error', () => {});
    q.end(bytes); await entered;
    const closed = new Promise(r => q.once('close', r)); q.destroy(); await closed;
    for (let n = 0; n < 5; n++) await new Promise(r => setImmediate(r));
    release();
    for (let n = 0; n < 5; n++) await new Promise(r => setImmediate(r));
    assert.deepEqual(world(f), before, 'DISCONNECTED_AT_EFFECT_BOUNDARY_NO_COMMITTED_EFFECT');
  } finally { release(); await f.app.close(); }
});
