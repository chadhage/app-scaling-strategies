'use strict';

// C010 scenario "The inspection page re-derives every outcome from facts": page.js runs under a DOM stub built from the real index.html (and in
// real Edge: tests\browser.cjs). The fetch it gets reaches a real loopback server (or a tampered copy of its answers). The rendered DOM is checked
// after every action: unique ids, 30 rows of 6 cells, a closed set of outcomes, and a summary that reconciles with the rows. A tampered state, a
// forged refusal or a missing answer is shown as a violation and nothing is announced as allowed by itself.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { call, seed, withApp } = require('./helpers.cjs');
const { createDocument, runPage, rootDir } = require('./dom-stub.cjs');

const OUTCOMES = new Set(['allowed', 'forbidden', 'violation', 'no answer']);
const IDENTITIES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const rowsOf = (document) => document.getElementById('rows').children.map((row) => row.children.map((cell) => cell.textContent));
const outcomesOf = (document) => document.getElementById('rows').children.map((row) => row.children[5].attributes['data-outcome']);

function wire(context, tamper = (answer) => answer, transcript = null) {
  const calls = [];
  // The page's fetch is answered by the real server over a plain http request; with a transcript the answer the server produced the first time
  // is replayed for the same request (so ten forgeries cost one real inspection, not ten).
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const key = `${url}|${init.headers?.Authorization ?? ''}`;
    let real = transcript?.get(key);
    if (!real) {
      const live = await call(context, null, init.method || 'GET', url, undefined, init.headers || {});
      real = { status: live.status, text: live.text };
      transcript?.set(key, real);
    }
    const tampered = tamper({ url, init, status: real.status, text: real.text });
    if (tampered === 'throw') throw new TypeError('network error');
    return { status: tampered.status, text: async () => tampered.text };
  };
  return { fetch, calls };
}

async function inspect(context, tokens, tamper, transcript) {
  const network = wire(context, tamper, transcript);
  const { document } = await runPage({ fetch: network.fetch });
  for (const identity of IDENTITIES) document.getElementById(`token-${identity}`).value = tokens[identity] ?? '';
  await document.getElementById('run').click();
  return { document, ...network };
}

function invariants(document, label) {
  const ids = [...document.elements.keys()];
  assert.equal(new Set(ids).size, ids.length, `${label}: unique ids`);
  const rows = rowsOf(document);
  for (const row of rows) assert.equal(row.length, 6, `${label}: six cells`);
  for (const outcome of outcomesOf(document)) assert.ok(OUTCOMES.has(outcome), `${label}: ${outcome}`);
  const bad = outcomesOf(document).filter((outcome) => outcome === 'violation' || outcome === 'no answer').length;
  const status = document.getElementById('status').textContent;
  if (rows.length > 0) assert.match(status, bad === 0 ? new RegExp(`^Checked ${rows.length} rows: every owner reached`) : new RegExp(`^Checked ${rows.length} rows: ${bad} violation\\(s\\)`), label);
  return { rows, bad, status };
}

test('with the four real tokens the page shows 30 rows: every owner reaches its own resources, nobody reaches a foreign one, nothing is shown by itself', () => withApp({}, async (context) => {
  const { tokens } = await seed(context);
  const { document, calls } = await inspect(context, tokens);
  const { rows, bad, status } = invariants(document, 'real server');
  assert.equal(rows.length, 30);
  assert.equal(bad, 0);
  assert.match(status, /^Checked 30 rows: every owner reached its own resources and no foreign resource was reachable by anyone else\.$/);
  assert.deepEqual(outcomesOf(document).reduce((count, outcome) => ({ ...count, [outcome]: (count[outcome] ?? 0) + 1 }), {}), { allowed: 15, forbidden: 15 });
  assert.deepEqual(rows.slice(0, 4).map((row) => row.slice(0, 3)), IDENTITIES.map((identity) => [identity, 'who am I', 'itself']));
  assert.deepEqual(rows.filter((row) => row[2].startsWith('foreign')).map((row) => [row[0], row[3], row[4]]).slice(0, 2), [['conductor-a', '404', 'TARGET_NOT_FOUND'], ['conductor-a', '404', 'TARGET_NOT_FOUND']]);
  assert.deepEqual(rows.filter((row) => row[0] === 'visitor' || row[0] === 'operator').filter((row) => row[1] !== 'who am I' && row[1] !== 'read lease metadata').map((row) => [row[3], row[4]]), Array(4).fill(['403', 'ROLE_FORBIDDEN']));
  assert.deepEqual(rows.find((row) => row[0] === 'anonymous').slice(3), ['401', 'AUTHENTICATION_REQUIRED', 'forbidden']);
  for (const call of calls) {
    assert.equal(call.init.method, undefined, 'only GET is ever sent');
    assert.match(call.url, /^\/v1\/(me|leases|operator\/leases)/);
  }
  assert.equal(calls.filter((entry) => entry.init.headers.Authorization === undefined).length, 1, 'only the anonymous probe has no credential');
  assert.deepEqual(new Set(calls.map((entry) => entry.init.headers.Authorization)), new Set([undefined, ...IDENTITIES.map((identity) => `Bearer ${tokens[identity]}`)]));
}));

test('before the first click nothing is shown as allowed, and without a complete lease for both conductors nothing is inspected', () => withApp({}, async (context) => {
  const { document } = await runPage({ fetch: wire(context).fetch });
  assert.match(document.getElementById('status').textContent, /^Not inspected yet\. Nothing is shown as allowed until the server says so\.$/);
  assert.deepEqual(rowsOf(document), []);
  const tokens = Object.fromEntries(IDENTITIES.map((name) => [name, context.app.issueToken(name)]));
  const empty = await inspect(context, tokens);
  assert.match(empty.document.getElementById('status').textContent, /^Nothing to inspect: no complete lease with a run, a scratch resource and an export was listed for conductor-a and conductor-b\. Nothing is shown as allowed\.$/);
  assert.deepEqual(rowsOf(empty.document), []);
  const { ids } = await seed(context);
  assert.ok(ids.a.lease);
  const none = await inspect(context, { ...tokens, 'conductor-a': '' });
  assert.match(none.document.getElementById('status').textContent, /listed for conductor-a and conductor-b|listed for conductor-a\./);
}));

const TAMPERS = {
  'a foreign lease read answered 200 with the victim\'s data': (answer, ids) => (answer.url === `/v1/leases/${ids.a.lease}` && answer.init.headers.Authorization?.endsWith(answer.tokenB) ? { status: 200, text: JSON.stringify({ outcome: 'ok', lease: { id: ids.a.lease } }) } : answer),
  'a foreign refusal that differs from the absent control by one byte': (answer, ids) => (answer.url === `/v1/leases/${ids.a.lease}/runs/${ids.a.run}` ? { ...answer, text: `${answer.text} ` } : answer),
  'a role refusal answered 404 instead of 403': (answer) => (answer.status === 403 ? { ...answer, status: 404 } : answer),
  'an own read answered 404': (answer, ids) => (answer.url === `/v1/leases/${ids.b.lease}/runs/${ids.b.run}` && answer.status === 200 ? { status: 404, text: answer.text } : answer),
  'an anonymous read answered 200': (answer) => (answer.init.headers.Authorization === undefined ? { status: 200, text: '{"outcome":"ok"}' } : answer),
  'a who-am-I that names another subject': (answer) => (answer.url === '/v1/me' ? { ...answer, text: answer.text.replace('"role":"operator"', '"role":"visitor"') } : answer),
  'an operator view that leaks a resource id': (answer, ids) => (answer.url === '/v1/operator/leases' ? { ...answer, text: answer.text.replace('"items":[', `"items":[{"id":"x","owner":"y","note":"${ids.a.run}"},`) } : answer),
  'an answer that is not JSON': (answer, ids) => (answer.url === `/v1/leases/${ids.a.lease}/exports/${ids.a.export}` ? { status: 200, text: 'not json' } : answer),
  'a network failure': (answer, ids) => (answer.url === `/v1/leases/${ids.a.lease}/scratches/${ids.a.scratch}` ? 'throw' : answer),
  'a refusal code outside the closed list': (answer) => (answer.status === 401 ? { ...answer, text: '{"outcome":"WHATEVER","error":{"code":"WHATEVER"}}' } : answer)
};

test('a tampered answer is a violation on screen, counted, and never announced as allowed: ten kinds of forgery, the DOM invariants after each', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const transcript = new Map();
  assert.equal(invariants((await inspect(context, tokens, undefined, transcript)).document, 'the genuine transcript').bad, 0);
  for (const [name, forge] of Object.entries(TAMPERS)) {
    const { document } = await inspect(context, tokens, (answer) => forge({ ...answer, tokenB: tokens['conductor-b'] }, ids), transcript);
    const { bad, status } = invariants(document, name);
    assert.ok(bad >= 1, `${name}: the forgery was not noticed`);
    assert.match(status, /violation\(s\)\. Do not trust this server\.$/, name);
    assert.equal(/every owner reached/.test(status), false, `${name}: nothing is announced as fine`);
  }
}));

test('the page derives the table from facts, not from the wording of the server: another message with the same code and status is the same row', () => withApp({}, async (context) => {
  const { tokens } = await seed(context);
  const transcript = new Map();
  const plain = await inspect(context, tokens, undefined, transcript);
  const reworded = await inspect(context, tokens, (answer) => (answer.status >= 400 ? { ...answer, text: answer.text.replace(/"message":"[^"]*"/, '"message":"entirely different prose"') } : answer), transcript);
  assert.deepEqual(rowsOf(reworded.document), rowsOf(plain.document), 'the same rows whatever the prose');
  const wrongTokens = await inspect(context, { ...tokens, 'conductor-a': tokens['conductor-b'] }, undefined, transcript);
  const { bad } = invariants(wrongTokens.document, 'swapped tokens');
  assert.ok(bad >= 1, 'two conductors presenting the same token are noticed: the who-am-I of conductor-a names conductor-b');
  assert.equal((await call(context, null, 'GET', '/page.js')).status, 200);
}));

test('the markup: no inline script, no inline handler or style, one polite status region, every input labelled, native focusable controls only', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.deepEqual([...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]), ['<script src="/page.js">'], 'one external script');
  assert.equal(/<script\b[^>]*>[^<]+<\/script>/.test(html), false, 'no inline script');
  assert.equal(/\son[a-z]+\s*=/i.test(html), false, 'no inline handler');
  assert.equal(/\sstyle\s*=/i.test(html), false, 'no inline style');
  assert.deepEqual([...html.matchAll(/role="status"/g)].length, 1);
  const inputs = [...html.matchAll(/<input\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(inputs.length, 4);
  for (const id of inputs) assert.ok(html.includes(`<label for="${id}">`), `${id} has a label`);
  assert.equal(/tabindex/i.test(html), false, 'no tabindex tricks: every control is natively focusable');
  assert.ok(/<html lang="en">/.test(html) && /<title>[^<]+<\/title>/.test(html));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  const page = fs.readFileSync(path.join(rootDir, 'page.js'), 'utf8');
  for (const forbidden of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'localStorage', 'sessionStorage', 'document.cookie']) assert.equal(page.includes(forbidden), false, forbidden);
  assert.match(fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8'), /:focus-visible/);
  for (const id of ['run', 'status', 'rows']) assert.ok(createDocument().elements.has(id), id);
});
