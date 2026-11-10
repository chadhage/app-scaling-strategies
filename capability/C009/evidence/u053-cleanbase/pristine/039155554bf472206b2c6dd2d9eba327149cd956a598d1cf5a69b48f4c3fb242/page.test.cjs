'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { load, withApp } = require('./helpers.cjs');
const { createDocument, runPage, rootDir, subjectDir } = require('./dom-stub.cjs');

const contract = load('contract.js');
const DASH = '\u2014';
const until = async (predicate, label) => {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new assert.AssertionError({ message: `${label} was not reached` });
};

// Sends the page's relative URLs to the real loopback server and records what the page put on the wire.
function wire(context) {
  const calls = [];
  const fetch = (url, init = {}) => { calls.push({ url, init }); return globalThis.fetch(context.origin + url, init); };
  return { fetch, calls };
}
const cells = (document) => document.getElementById('rows').children.map((row) => row.children.map((cell) => cell.textContent));
const expected = (role) => [...Object.keys(contract.commands).map((command) => {
  const allowed = contract.commands[command].roles.includes(role);
  return [command, allowed ? 'allowed' : 'denied', allowed ? '200' : '403', allowed ? 'ok' : 'ROLE_FORBIDDEN', role];
}), ['native.execute', 'denied', '404', 'COMMAND_UNKNOWN', role]];

async function open(context, token = '', claim = '') {
  const network = wire(context);
  const { document } = await runPage({ fetch: network.fetch });
  document.getElementById('token').value = token;
  document.getElementById('claim').value = claim;
  await until(() => document.getElementById('revision').textContent !== 'unknown', 'the first server revision');
  return { document, ...network };
}

test('the page starts with no decision, shows the server revision and never marks anything allowed by itself', () => withApp({}, async (context) => {
  const { document } = await open(context);
  assert.match(document.getElementById('status').textContent, /^Not checked yet/);
  assert.deepEqual(cells(document), []);
  assert.equal(document.getElementById('revision').textContent, '0');
  assert.match(document.getElementById('sent').textContent, /^Nothing sent/);
}));

for (const identity of ['visitor', 'conductor-a', 'conductor-b', 'operator']) {
  test(`the table for ${identity} is exactly the server decision, whatever role is claimed`, () => withApp({}, async (context) => {
    const token = context.app.issueToken(identity);
    const { role, subject } = contract.identities[identity];
    for (const claim of ['', 'visitor', 'conductor', 'operator']) {
      const { document, calls } = await open(context, token, claim);
      await document.getElementById('check').click();
      assert.deepEqual(cells(document), expected(role), `${identity} claiming "${claim}"`);
      assert.equal(document.getElementById('status').textContent, `Server decisions for ${subject} (${role}).`);
      const previews = calls.filter((call) => call.url.startsWith('/v1/authorization/preview'));
      assert.equal(previews.length, 5);
      for (const call of previews) {
        assert.equal(call.init.headers.Authorization, `Bearer ${token}`);
        assert.equal(call.init.headers['X-Role'], claim || undefined);
      }
    }
  }));
}

test('without a token, with a forged, malformed or expired one, every row is refused with the typed code', () => withApp({}, async (context) => {
  const expired = context.app.issueToken('operator', { ttlMs: 0 });
  const cases = [['', 'AUTHENTICATION_REQUIRED'], ['nope', 'TOKEN_MALFORMED'], [`c009_${'Z'.repeat(43)}`, 'TOKEN_UNKNOWN'], [expired, 'TOKEN_EXPIRED']];
  for (const [token, code] of cases) {
    const { document } = await open(context, token, 'operator');
    await document.getElementById('check').click();
    const rows = cells(document);
    assert.equal(rows.length, 5);
    for (const row of rows) assert.deepEqual(row.slice(1), ['refused', '401', code, DASH]);
    assert.equal(document.getElementById('status').textContent, `Server refused the credential: ${code}. Nothing is shown as allowed.`);
    assert.equal(JSON.stringify(rows).includes('allowed'), false);
  }
}));

test('sending shows the real outcome and revision, and a forbidden command changes nothing', () => withApp({}, async (context) => {
  const visitor = await open(context, context.app.issueToken('visitor'), 'operator');
  const before = context.app.snapshot();
  visitor.document.getElementById('command').value = 'pool.resize';
  await visitor.document.getElementById('send').click();
  assert.match(visitor.document.getElementById('sent').textContent, /^HTTP 403 ROLE_FORBIDDEN/);
  assert.deepEqual(context.app.snapshot(), before);
  const operator = await open(context, context.app.issueToken('operator'));
  operator.document.getElementById('command').value = 'pool.resize';
  await operator.document.getElementById('send').click();
  assert.match(operator.document.getElementById('sent').textContent, /^HTTP 200 ok/);
  assert.equal(operator.document.getElementById('revision').textContent, '1');
  assert.equal(context.app.snapshot().state.pool.size, 3);
  const post = operator.calls.at(-2);
  assert.equal(post.init.method, 'POST');
  assert.equal(post.init.headers['Content-Type'], 'application/json');
  assert.equal(operator.document.getElementById('sent').textContent.includes('operator'), false, 'no echo of client-supplied text');
  operator.document.getElementById('command').value = 'native.execute';
  await operator.document.getElementById('send').click();
  assert.match(operator.document.getElementById('sent').textContent, /^HTTP 404 COMMAND_UNKNOWN/);
}));

test('an unreachable or blocked server is reported as not sent and never as a decision', async () => {
  const document = createDocument();
  let reads = 0;
  const fetch = async (url, init = {}) => {
    if (init.method === 'POST') throw new TypeError('blocked');
    reads += 1;
    if (url === '/v1/state') return { status: 200, json: async () => ({ revision: 4 }) };
    if (reads === 2) return { status: 200, json: async () => { throw new SyntaxError('not json'); } };
    if (reads === 3) return { status: 200, json: async () => ({ outcome: 'ok' }) };
    throw new TypeError('offline');
  };
  await runPage({ fetch, document });
  await until(() => document.getElementById('revision').textContent === '4', 'the revision');
  await document.getElementById('check').click();
  const rows = cells(document);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], ['run.create', 'no decision', DASH, 'MALFORMED_ANSWER', DASH]);
  assert.deepEqual(rows[1], ['scratch.create', 'no decision', DASH, 'MALFORMED_ANSWER', DASH]);
  assert.deepEqual(rows[2], ['pool.resize', 'not sent', DASH, 'NO_SERVER_ANSWER', DASH]);
  assert.match(document.getElementById('status').textContent, /^No server decision/);
  await document.getElementById('send').click();
  assert.match(document.getElementById('sent').textContent, /^Not sent/);
  assert.equal(document.getElementById('revision').textContent, '4');
});

test('the markup and script are CSP-clean: no inline script, handler, style or HTML injection sink', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.deepEqual([...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]), ['<script src="/page.js">']);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|\sstyle\s*=|javascript:/i);
  const script = fs.readFileSync(path.join(subjectDir, 'page.js'), 'utf8');
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|localStorage|sessionStorage/);
});
