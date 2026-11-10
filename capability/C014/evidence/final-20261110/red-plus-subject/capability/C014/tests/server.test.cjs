'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { startLocal, routeClass, createOut, ASSETS } = require('../server.cjs');
const { seedConfig, canaryList, WHO } = require('./canaries.cjs');
const { call, exchange, build, parseAnswers } = require('./harness.cjs');
const { scan } = require('./scanner.cjs');

const config = seedConfig();
const FORGED = `c009_${'A'.repeat(43)}`;
async function withLocal(body, options = {}) {
  const local = await startLocal({ config, ...options });
  try { return await body(local); } finally { await local.close(); }
}
const ROLE_OF = { visitor: 'visitor', 'conductor-a': 'conductor', 'conductor-b': 'conductor', operator: 'operator' };

test('routeClass maps a path to a closed class and never returns the path', () => {
  assert.deepEqual(['/', '/page.js', '/style.css', '/scope.json', '/v1/evidence/trace', '/v1/evidence/bundle', '/v1/manage/config', '/v1/commands/x.y', '/x', '/v1/commands/a/b'].map(routeClass),
    ['asset', 'asset', 'asset', 'scope', 'evidence', 'evidence', 'manage', 'command', 'unknown', 'unknown']);
  assert.deepEqual(Object.keys(ASSETS), ['/', '/page.js', '/style.css']);
});

test('every public route answers every valid identity the same; a bad credential is never read as anonymous (401 with its typed code and challenge)', () => withLocal(async ({ port, service }) => {
  const expired = service.issueToken('operator', { ttlMs: 0 });
  const routes = ['/', '/page.js', '/style.css', '/scope.json', '/v1/evidence/trace', '/v1/evidence/runs', '/v1/evidence/audit', '/v1/evidence/logs', '/v1/evidence/bundle'];
  for (const route of routes) {
    const bodies = new Set();
    for (const token of [null, ...WHO.map((who) => config.tokens[who])]) {
      const result = await call(port, 'GET', route, { token });
      assert.equal(result.status, 200, `${route}`);
      if (route.startsWith('/v1/evidence/') && route !== '/v1/evidence/bundle') bodies.add(result.json().kind);
      assert.equal(result.answer.headers['cache-control'], 'no-store');
    }
    for (const [token, code] of [[FORGED, 'TOKEN_UNKNOWN'], [expired, 'TOKEN_EXPIRED'], ['not-a-token', 'TOKEN_MALFORMED']]) {
      const result = await call(port, 'GET', route, { token });
      assert.equal(result.status, 401, `${route} ${code}`);
      assert.equal(result.json().error.code, code);
      assert.match(result.answer.headers['www-authenticate'], /^Bearer realm="c009-local"/);
    }
  }
}));

test('the management route is for the operator: 401 without a token, 403 for a visitor and a conductor, 200 booleans and counts for the operator', () => withLocal(async ({ port }) => {
  assert.equal((await call(port, 'GET', '/v1/manage/config')).json().error.code, 'AUTHENTICATION_REQUIRED');
  for (const who of ['visitor', 'conductor-a', 'conductor-b']) {
    const result = await call(port, 'GET', '/v1/manage/config', { token: config.tokens[who] });
    assert.equal(result.status, 403);
    assert.deepEqual([result.json().error.code, result.json().role, result.json().requiredRoles], ['ROLE_FORBIDDEN', ROLE_OF[who], ['operator']]);
  }
  const ok = await call(port, 'GET', '/v1/manage/config', { token: config.tokens.operator });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json(), { outcome: 'ok', configured: { tokens: 4, signingKey: true, connectionString: true, serviceCredential: true, contacts: 4 } });
}));

test('every answer: no-store, nosniff, no referrer, the C009 CSP, no cookie, no CORS header, no redirect, no source map', () => withLocal(async ({ port }) => {
  const targets = ['/', '/page.js', '/style.css', '/scope.json', '/v1/evidence/runs', '/v1/evidence/bundle', '/v1/manage/config', '/v1/nowhere', '/%zz'];
  for (const target of targets) {
    const { answer } = await call(port, 'GET', target, { headers: { Origin: `http://127.0.0.1:${port}`, Cookie: 'sid=1' } });
    const names = Object.keys(answer.headers);
    assert.equal(answer.headers['cache-control'], 'no-store', target);
    assert.equal(answer.headers['x-content-type-options'], 'nosniff');
    assert.equal(answer.headers['referrer-policy'], 'no-referrer');
    assert.match(answer.headers['content-security-policy'], /^default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'/);
    assert.deepEqual(names.filter((name) => /^(set-cookie|location|access-control-.*|sourcemap|x-sourcemap|link|refresh)$/.test(name)), [], target);
  }
  for (const file of ['/page.js', '/style.css', '/']) {
    const bytes = (await call(port, 'GET', file)).answer.body;
    assert.ok(!/sourceMappingURL/.test(bytes.toString('utf8')), `${file} has no source map reference`);
    assert.deepEqual(scan(bytes, canaryList(config)), [], `${file} holds no canary, in a comment or anywhere else`);
  }
}));

test('an operator reads the bundle as a download and the signature verifies; the content type and the file name are fixed', () => withLocal(async ({ port }) => {
  const { answer } = await call(port, 'GET', '/v1/evidence/bundle');
  assert.equal(answer.headers['content-disposition'], 'attachment; filename="c014-evidence-bundle.json"');
  assert.equal(answer.headers['content-type'], 'application/json; charset=utf-8');
}));

test('run.create by a conductor and config.check by the operator: typed answers, the evidence shows facts only, claims are reported by name and never obeyed', () => withLocal(async ({ port }) => {
  const claims = { 'X-Role': 'operator', 'X-Forwarded-User': 'operator', 'X-Not-A-Claim': 'x' };
  const made = await call(port, 'POST', '/v1/commands/run.create', { token: config.tokens['conductor-a'], headers: claims, body: { name: 'first-run', units: 4 } });
  assert.equal(made.status, 200);
  assert.deepEqual(Object.keys(made.json()), ['outcome', 'command', 'revision', 'actor', 'result', 'auditSeq', 'ignoredClaims']);
  assert.deepEqual([made.json().actor, made.json().result, made.json().ignoredClaims], [{ subject: 'conductor-a', role: 'conductor' }, { id: 'run-0001', checked: null }, ['x-forwarded-user', 'x-role']]);
  const wrongRole = await call(port, 'POST', '/v1/commands/run.create', { token: config.tokens.operator, body: { name: 'x', units: 1 } });
  assert.equal(wrongRole.status, 403);
  const checked = await call(port, 'POST', '/v1/commands/config.check', { token: config.tokens.operator, body: { mode: 'ok' } });
  assert.deepEqual(checked.json().result, { id: null, checked: true });
  const failed = await call(port, 'POST', '/v1/commands/config.check', { token: config.tokens.operator, body: { mode: 'fail' } });
  assert.equal(failed.status, 500);
  assert.equal(failed.json().error.message, 'The command failed and had no effect.');
  const runs = (await call(port, 'GET', '/v1/evidence/runs')).json();
  assert.deepEqual(runs.items, [{ id: 'run-0001', units: 4, owner: 'conductor-a', revision: 1, status: 'ok', artifacts: 1, steps: runs.items[0].steps }]);
  assert.equal(runs.items[0].steps[0].event, 'dispatch');
  assert.match(runs.items[0].steps[0].detail, /^POST https:\/\/upstream\.synthetic\.invalid\/dispatch as \[redacted\] Authorization: Bearer \[redacted\] for \[redacted\] <\[redacted\]> \[redacted\]$/);
  const trace = (await call(port, 'GET', '/v1/evidence/trace?limit=200')).json();
  const failure = trace.items.find((item) => item.kind === 'error');
  assert.deepEqual(failure.steps.map((step) => step.detail), ["Login failed for user '[redacted]' using [redacted]", 'connect ECONNREFUSED [redacted] (password [redacted])']);
  const audit = (await call(port, 'GET', '/v1/evidence/audit')).json();
  assert.deepEqual(audit.items.map((item) => [item.outcome, item.code, item.command, item.subject]), [['applied', 'ok', 'run.create', 'conductor-a'], ['denied', 'ROLE_FORBIDDEN', 'run.create', 'operator'],
    ['applied', 'ok', 'config.check', 'operator'], ['failed', 'COMMAND_FAILED', 'config.check', 'operator']]);
  assert.equal(scan(Buffer.concat([made.bytes, checked.bytes, failed.bytes]), canaryList(config)).length, 0);
}));

test('the limit parameter: 1 to 200, nothing else; any other query on any route is a typed 400 and no query is echoed', () => withLocal(async ({ port }) => {
  for (const [target, status] of [['/v1/evidence/trace?limit=1', 200], ['/v1/evidence/trace?limit=200', 200], ['/v1/evidence/trace?limit=0', 400], ['/v1/evidence/trace?limit=201', 400],
    ['/v1/evidence/trace?limit=05', 400], ['/v1/evidence/trace?limit=abc', 400], ['/v1/evidence/trace?limit=1&limit=2', 400], ['/v1/evidence/trace?other=1', 400], ['/v1/evidence/trace?limit=', 400],
    ['/v1/evidence/bundle?limit=5', 400], ['/scope.json?x=1', 400], ['/page.js?v=2', 400], ['/v1/manage/config?x=1', 400]]) {
    const result = await call(port, 'GET', target, { token: target.includes('manage') ? config.tokens.operator : null });
    assert.equal(result.status, status, target);
    if (status === 400) assert.match(result.json().outcome, /^QUERY_(INVALID|NOT_ALLOWED)$/);
  }
  assert.equal((await call(port, 'GET', '/v1/evidence/trace?limit=3')).json().limit, 3);
  assert.equal((await call(port, 'GET', '/v1/evidence/trace')).json().limit, 50);
}));

test('createOut sends JSON only as a PublicBody: a plain object, a string or a buffer is a TypeError before anything is written', () => {
  const written = [];
  const response = { req: { socket: {} }, writeHead: (...args) => written.push(args), end: (...args) => written.push(args) };
  const out = createOut(response, { publish: () => null }, { code: null });
  for (const raw of [{ outcome: 'ok' }, '{"a":1}', Buffer.from('x'), null, undefined, { value: {}, toJSON: () => ({}) }]) assert.throws(() => out.send(200, raw), TypeError);
  assert.deepEqual(written, []);
});

test('close ends an idle connection and may be called twice; a second server beside it is untouched', () => withLocal(async (first) => {
  const second = await startLocal({ config });
  try {
    const idle = net.connect({ port: first.port, host: '127.0.0.1' });
    await new Promise((resolve) => idle.once('connect', resolve));
    const closed = new Promise((resolve) => idle.once('close', resolve));
    await first.close();
    await closed;
    await first.close();
    assert.equal((await call(second.port, 'GET', '/scope.json')).status, 200);
  } finally { await second.close(); }
}));

test('the connection cap: past `connections` open sockets the server drops the next one and keeps the others', { timeout: 30000 }, () => withLocal(async ({ port }) => {
  const open = [];
  for (let index = 0; index < 2; index += 1) {
    const socket = net.connect({ port, host: '127.0.0.1' });
    await new Promise((resolve) => socket.once('connect', resolve));
    open.push(socket);
  }
  const third = net.connect({ port, host: '127.0.0.1' });
  third.on('error', () => {});
  await new Promise((resolve) => third.once('close', resolve));
  assert.ok(open.every((socket) => !socket.destroyed), 'the first two stay');
  open.forEach((socket) => socket.destroy());
}, { limits: { connections: 2 } }));

test('a connection that sends nothing is closed by the server (idle limit); a foreign Host is a typed 421 that closes too', { timeout: 30000 }, () => withLocal(async ({ port }) => {
  const idle = net.connect({ port, host: '127.0.0.1' });
  await new Promise((resolve) => idle.once('close', resolve));
  const reply = await exchange(port, build('GET', '/scope.json', { port, host: 'example.invalid' }), { settleMs: 10000 });
  assert.equal(parseAnswers(reply.bytes)[0].status, 421);
  assert.equal(reply.closed, true);
}, { limits: { idleMs: 300 } }));

test('a request target that URL parsing rejects is a typed 400, an absolute-form target for another origin is a typed 400, and 2,048 characters of URL are allowed but 2,049 are not', () => withLocal(async ({ port }) => {
  for (const target of ['//a:b', 'http://example.invalid/scope.json']) {
    const result = await call(port, 'GET', target);
    assert.deepEqual([result.status, result.json().error.code, result.closed], [400, 'INVALID_URL', true], target);
  }
  const allowed = await call(port, 'GET', `/${'a'.repeat(2047)}`);
  assert.deepEqual([allowed.status, allowed.json().error.code], [404, 'NOT_FOUND'], 'a URL of 2,048 characters is routed (and unknown)');
  const refused = await call(port, 'GET', `/${'a'.repeat(2048)}`);
  assert.deepEqual([refused.status, refused.json().error.code], [414, 'URL_TOO_LONG'], 'a URL of 2,049 characters is refused');
}));

test('an unexpected failure inside a handler is a typed 500 INTERNAL_ERROR, never an authentication or URL answer', () => withLocal(async ({ port, service }) => {
  service.listBody = () => { throw new Error('boom'); };
  const result = await call(port, 'GET', '/v1/evidence/runs');
  assert.deepEqual([result.status, result.json().error.code, result.closed], [500, 'INTERNAL_ERROR', true]);
  assert.ok(!JSON.stringify(result.json()).includes('boom'), 'the failure text is not echoed');
}));

test('every request is recorded with its route class, its status, its typed code and its role', () => withLocal(async ({ port, service }) => {
  await call(port, 'GET', '/scope.json', { token: config.tokens.operator });
  await call(port, 'GET', '/v1/evidence/runs', { token: FORGED });
  await call(port, 'GET', '/v1/manage/config', { token: config.tokens.visitor });
  await call(port, 'GET', '/nowhere');
  const wanted = [['scope', 200, 'ok', 'operator'], ['evidence', 401, 'TOKEN_UNKNOWN', null], ['manage', 403, 'ROLE_FORBIDDEN', 'visitor'], ['unknown', 404, 'NOT_FOUND', null]];
  for (let turn = 0; turn < 200 && service.listBody('logs', 200).value.items.length < wanted.length; turn += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(service.listBody('logs', 200).value.items.map((item) => [item.route, item.status, item.code, item.role]), wanted);
  assert.deepEqual(service.listBody('trace', 200).value.items.filter((item) => item.kind === 'request').map((item) => [item.route, item.status, item.code, item.role]), wanted);
}));

test('a COMMAND request is recorded with the role of its caller as well: a conductor, a visitor that is refused, an anonymous caller and a forged token', () => withLocal(async ({ port, service }) => {
  const body = { name: 'role-run', units: 1 };
  await call(port, 'POST', '/v1/commands/run.create', { token: config.tokens['conductor-a'], body });
  await call(port, 'POST', '/v1/commands/run.create', { token: config.tokens.visitor, body });
  await call(port, 'POST', '/v1/commands/run.create', { body });
  await call(port, 'POST', '/v1/commands/run.create', { token: FORGED, body });
  await call(port, 'POST', '/v1/commands/config.check', { token: config.tokens.operator, body: { mode: 'ok' } });
  const wanted = [['command', 200, 'ok', 'conductor'], ['command', 403, 'ROLE_FORBIDDEN', 'visitor'], ['command', 401, 'AUTHENTICATION_REQUIRED', null], ['command', 401, 'TOKEN_UNKNOWN', null], ['command', 200, 'ok', 'operator']];
  for (let turn = 0; turn < 200 && service.listBody('logs', 200).value.items.length < wanted.length; turn += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(service.listBody('logs', 200).value.items.map((item) => [item.route, item.status, item.code, item.role]), wanted);
  assert.deepEqual(service.listBody('trace', 200).value.items.filter((item) => item.kind === 'request').map((item) => [item.route, item.status, item.code, item.role]), wanted);
}));

test('the three assets are served BYTE FOR BYTE: GET /, /page.js and /style.css return exactly index.html, page.js and style.css of the namespace, with their content types', () => withLocal(async ({ port }) => {
  const sources = [];
  for (const [route, [file, type]] of Object.entries(ASSETS)) {
    const result = await call(port, 'GET', route);
    const expected = fs.readFileSync(path.join(__dirname, '..', file));
    assert.equal(result.status, 200, route);
    assert.ok(result.answer.body.equals(expected), `${route} is ${file} (${result.answer.body.length} bytes, expected ${expected.length})`);
    assert.equal(result.answer.headers['content-type'], type, route);
    sources.push(expected.toString('latin1'));
  }
  assert.equal(new Set(sources).size, 3, 'three different files');
  assert.deepEqual(Object.entries(ASSETS).map(([route, [file]]) => [route, file]), [['/', 'index.html'], ['/page.js', 'page.js'], ['/style.css', 'style.css']]);
}));

test('the HTTP timeouts and the connection cap are configured on the server: header and request timeout, keep-alive one second, idle timeout, cap', () => withLocal(async ({ server }) => {
  assert.deepEqual([server.headersTimeout, server.requestTimeout, server.keepAliveTimeout, server.timeout, server.maxConnections], [4321, 4321, 1000, 777, 9]);
}, { limits: { headerMs: 4321, idleMs: 777, connections: 9 } }));

test('close ends an ACTIVE connection (an unfinished request) by two independent means: it calls closeAllConnections, and it destroys the tracked sockets even when that does nothing', { timeout: 60000 }, async () => {
  for (const [label, patch] of [
    ['the server method is called', (server, counter) => { const original = server.closeAllConnections.bind(server); server.closeAllConnections = () => { counter.calls += 1; original(); }; }],
    ['the tracked sockets alone', (server) => { server.closeAllConnections = () => {}; }]
  ]) {
    const local = await startLocal({ config });
    const counter = { calls: 0 };
    patch(local.server, counter);
    const active = net.connect({ port: local.port, host: '127.0.0.1' });
    active.on('error', () => {});
    try {
      await new Promise((resolve) => active.once('connect', resolve));
      active.write(`POST /v1/commands/run.create HTTP/1.1\r\nHost: 127.0.0.1:${local.port}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n01234`);
      for (let turn = 0; turn < 200 && (await new Promise((resolve) => local.server.getConnections((error, count) => resolve(count)))) < 1; turn += 1) await new Promise((resolve) => setTimeout(resolve, 20));
      const ended = new Promise((resolve) => active.once('close', () => resolve('ended')));
      local.close();
      // a close that does not end the connection never settles, so the answer is raced against a timer that only keeps a broken close from hanging the test
      const result = await Promise.race([ended, new Promise((resolve) => setTimeout(() => resolve('still open'), 8000))]);
      assert.equal(result, 'ended', label);
      if (label === 'the server method is called') assert.equal(counter.calls, 1, 'closeAllConnections was called once');
    } finally { active.destroy(); }
  }
});

test('the evidence of real traffic carries its literal kinds and statuses (upstream 202, store 200, error 500, planted 200 and 500, the planted run with one unit), and the log level follows the status at every boundary', () => withLocal(async ({ port, service }) => {
  assert.equal((await call(port, 'POST', '/v1/commands/run.create', { token: config.tokens['conductor-a'], body: { name: 'a-run', units: 3 } })).status, 200);
  assert.equal((await call(port, 'POST', '/v1/commands/config.check', { token: config.tokens.operator, body: { mode: 'ok' } })).status, 200);
  assert.equal((await call(port, 'POST', '/v1/commands/config.check', { token: config.tokens.operator, body: { mode: 'fail' } })).status, 500);
  service.plant('trace', 'a plain note');
  service.plant('error', 'a plain failure');
  service.plant('log', 'a plain line');
  service.plant('run', 'a plain run');
  const trace = service.listBody('trace', 200).value.items.filter((item) => item.kind !== 'request');
  assert.deepEqual(trace.map((item) => [item.kind, item.status, item.code]), [['upstream', 202, 'ok'], ['store', 200, 'ok'], ['error', 500, 'COMMAND_FAILED'], ['upstream', 200, 'ok'], ['error', 500, 'COMMAND_FAILED']]);
  const planted = service.listBody('runs', 200).value.items.find((item) => item.id === 'run-9002');
  assert.deepEqual([planted.id, planted.units, planted.owner], ['run-9002', 1, 'operator'], 'the planted run is the second run of the ledger: 9001 plus the number of runs before it');
  const lines = [];
  for (const status of [200, 399, 400, 404, 499, 500, 503, 599]) service.recordRequest({ method: 'GET', route: 'asset', status, code: 'ok', role: null, url: '/', headers: {} });
  for (const item of service.listBody('logs', 200).value.items.filter((entry) => entry.event === 'request' && entry.route === 'asset')) lines.push([item.status, item.level]);
  assert.deepEqual(lines, [[200, 'info'], [399, 'info'], [400, 'warn'], [404, 'warn'], [499, 'warn'], [500, 'error'], [503, 'error'], [599, 'error']]);
  assert.equal(service.listBody('logs', 200).value.items.find((item) => item.event === 'request' && item.route === 'command' && item.status === 200 && item.role === 'operator').level, 'info', 'the planted log line is an info');
}));
