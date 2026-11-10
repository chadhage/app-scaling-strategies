'use strict';

// The guards around the routes: static assets, a query where none is allowed, the depth of the per-connection lanes, an internal failure,
// the fail-closed read stop (a stub socket and a listener that never listened), two live apps in one process closed in both orders.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { test } = require('node:test');
const { load, raw, startApp } = require('./helpers.cjs');

test('the static assets: the page, its script, the contract and the style, each only by GET, without query or body, under a strict CSP', async (t) => {
  const ctx = await startApp();
  t.after(() => ctx.close());
  for (const [path, type] of [['/', 'text/html'], ['/page.js', 'text/javascript'], ['/contract.js', 'text/javascript'], ['/style.css', 'text/css']]) {
    const res = await ctx.call('GET', path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers['content-type'], new RegExp(`^${type}`));
    assert.match(res.headers['content-security-policy'], /default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal((await ctx.call('GET', `${path}?x=1`)).json.outcome, 'QUERY_INVALID', path);
    assert.equal((await ctx.call('POST', path, { body: {} })).json.outcome, 'METHOD_NOT_ALLOWED', path);
    assert.equal((await ctx.call('GET', path, { rawBody: '{}' })).json.outcome, 'UNEXPECTED_BODY', path);
  }
  assert.match((await ctx.call('GET', '/')).text, /<script src="\/page\.js"><\/script>/);
  assert.equal((await ctx.call('POST', '/scope.json')).headers.allow, 'GET');
});

test('a query where none is allowed is refused on every other route, with and without a credential problem first', async (t) => {
  const ctx = await startApp();
  t.after(() => ctx.close());
  const { token } = await ctx.session('ada');
  for (const [method, target] of [['GET', '/v1/session?x=1'], ['GET', '/v1/profiles?limit=1'], ['GET', '/v1/admin/audit?x'], ['GET', '/v1/projects/proj-0001?x=1'], ['POST', '/v1/projects?x=1'], ['POST', '/v1/session/logout?x=1'], ['DELETE', '/v1/projects/proj-0001?x=1']]) {
    const res = await ctx.call(method, target, { token, ...(method === 'POST' && target.includes('projects') && { body: { name: 'x', units: 1 } }) });
    assert.equal(res.status, 400, target);
    assert.equal(res.json.outcome, 'QUERY_INVALID', target);
  }
  assert.equal((await ctx.call('GET', '/v1/session?x=1')).json.outcome, 'AUTHENTICATION_REQUIRED', 'authentication is decided first');
  assert.equal(ctx.app.health().ok, true);
});

test('the depth of the lanes: a client with more requests running or queued on one socket than the bound is cut off', async (t) => {
  const ctx = await startApp({ app: { limits: { pipelined: 2 } } });
  t.after(() => ctx.close());
  const { token } = await ctx.session('ada');
  const get = raw.request(ctx.port, 'GET', '/v1/session', { headers: [`Authorization: Bearer ${token}`] });
  const result = await raw.exchange(ctx.port, Buffer.concat([get, get, get, get, get]), { waitMs: 6000, settleMs: 300 });
  assert.equal(result.closedByServer, true, 'the connection was ended by the server');
  assert.ok(result.answers.length <= 2, `at most the bound was served (${result.answers.length})`);
});

test('an unexpected failure inside the handler fails closed: a typed 500 with the connection closed, never a hang or a stack', async (t) => {
  const ctx = await startApp();
  t.after(() => ctx.close());
  t.mock.method(fs, 'readFileSync', () => { throw new Error('disk gone'); });
  const answer = await ctx.bytes('GET', '/page.js');
  assert.equal(answer.status, 500);
  assert.equal(answer.json.outcome, 'INTERNAL_ERROR');
  assert.equal(answer.closedByServer, true);
  assert.doesNotMatch(answer.text, /disk gone|at /);
});

test('the read stop is checked on the first connection: a socket that cannot stop reading fails the server closed and nothing is served', async (t) => {
  const { createApp } = load('server.cjs');
  const app = createApp();
  const warnings = [];
  const onWarning = (warning) => { if (warning.code === 'C022_READ_STOP_UNAVAILABLE') warnings.push(warning); };
  process.on('warning', onWarning);
  t.after(() => process.off('warning', onWarning));
  assert.deepEqual(app.health(), { ok: true, reason: null });
  let destroyed = 0;
  const stub = (readStop) => ({ _handle: readStop ? { readStop() {} } : {}, destroy() { destroyed += 1; }, once() {} });
  // The app's own listener is the last one (Node's http layer registers its listener first); a stub socket never reaches Node's.
  const onConnection = app.server.listeners('connection').at(-1);
  onConnection(stub(true));
  assert.equal(destroyed, 0, 'a socket that can stop reading is served');
  assert.equal(app.health().ok, true);
  onConnection(stub(false));
  assert.equal(destroyed, 1);
  assert.deepEqual(app.health(), { ok: false, reason: 'READ_STOP_UNAVAILABLE' });
  onConnection(stub(true));
  assert.equal(destroyed, 2, 'once failed closed, every later connection is destroyed');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(warnings.length, 1, 'one warning, not one per connection');
  await app.close();
});

test('the read stop is checked at startup: a listener that lacks it fails closed and says so', async (t) => {
  const { createApp } = load('server.cjs');
  const app = createApp();
  const errors = [];
  app.server.once('error', (error) => errors.push(error.message));
  const warnings = [];
  const onWarning = (warning) => { if (warning.code === 'C022_READ_STOP_UNAVAILABLE') warnings.push(warning); };
  process.on('warning', onWarning);
  t.after(() => process.off('warning', onWarning));
  app.server.emit('listening');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^READ_STOP_UNAVAILABLE/);
  assert.equal(app.health().ok, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(warnings.length, 1);
  const real = await startApp();
  assert.equal(real.app.health().ok, true, 'a real listener has the read stop');
  await real.close();
  await app.close();
});

test('two live apps in one process share nothing and close independently: first-in-first-out, last-in-first-out, twice, with a neighbour left untouched', async () => {
  for (const order of ['fifo', 'lifo']) {
    const one = await startApp({ seed: 'one' });
    const two = await startApp({ seed: 'two' });
    const neighbour = http.createServer((request, response) => response.end('neighbour'));
    await new Promise((resolve) => neighbour.listen(0, '127.0.0.1', resolve));
    const held = await new Promise((resolve) => { const socket = require('node:net').connect(neighbour.address().port, '127.0.0.1', () => resolve(socket)); });
    const sessionOne = await one.session('ada');
    assert.equal((await two.call('GET', '/v1/session', { token: sessionOne.token })).json.outcome, 'TOKEN_UNKNOWN', 'the same seed, the same token string, another app: unknown');
    await two.session('ada');
    assert.equal((await one.call('GET', '/v1/session', { token: sessionOne.token })).status, 200);
    const [first, second] = order === 'fifo' ? [one, two] : [two, one];
    await first.close();
    await first.close();
    assert.equal((await second.call('GET', '/scope.json')).status, 200, 'the other app still serves');
    await second.close();
    await second.close();
    assert.equal(held.destroyed, false, 'the neighbour connection is untouched');
    held.destroy();
    await new Promise((resolve) => neighbour.close(resolve));
  }
});

test('close() ends a half-open connection that the HTTP layer no longer owns', async () => {
  const ctx = await startApp();
  const net = require('node:net');
  const socket = net.connect({ host: '127.0.0.1', port: ctx.port, allowHalfOpen: true });
  socket.on('error', () => {});
  await new Promise((resolve) => socket.once('connect', resolve));
  socket.write('GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:' + ctx.port + '\r\n');
  const closed = new Promise((resolve) => socket.once('close', resolve));
  await ctx.close();
  await closed;
  assert.equal(socket.destroyed, true);
});
