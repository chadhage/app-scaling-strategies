'use strict';

// C010 scenario "The inspection page re-derives every outcome from facts", the LEARNING step and the row markup (rev-C010 m7: the generated mutants
// of page.js that the first run left alive). The page learns the ids of each conductor by listing AS that conductor. A list answer that is not a
// clean 200 with well-formed ids of the right kind teaches it nothing: it then asks for nothing else as that conductor and says so. Each forged
// answer below is wrong in exactly ONE way, so that every check of the learning step has a case that only it can refuse.
const assert = require('node:assert/strict');
const test = require('node:test');
const { call, seed, withApp } = require('./helpers.cjs');
const { runPage } = require('./dom-stub.cjs');

const IDENTITIES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const NOTHING = /^Nothing to inspect: no complete lease with a run, a scratch resource and an export was listed for conductor-a\. Nothing is shown as allowed\.$/;
const FOLDERS = { run: 'runs', scratch: 'scratches', export: 'exports' };

// The page's fetch is answered by the real server; forge may replace one answer ({ status, text }) or throw to simulate a network failure.
// forge also learns how often the same request (URL and credential) was asked before: the first ask of a list is the learning step, a later one a probe.
function wire(context, forge) {
  const calls = [];
  const asked = new Map();
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const key = `${url}|${init.headers?.Authorization ?? ''}`;
    const nth = asked.get(key) ?? 0;
    asked.set(key, nth + 1);
    const live = await call(context, null, 'GET', url, undefined, init.headers || {});
    const answer = forge({ url, init, status: live.status, text: live.text, nth });
    if (answer === 'throw') throw new TypeError('network error');
    return { status: answer.status, text: async () => answer.text };
  };
  return { fetch, calls };
}

async function inspect(context, tokens, forge = (answer) => answer) {
  const network = wire(context, forge);
  const { document } = await runPage({ fetch: network.fetch });
  for (const identity of IDENTITIES) document.getElementById(`token-${identity}`).value = tokens[identity];
  await document.getElementById('run').click();
  return { document, ...network };
}

const urlsOf = (calls, token) => calls.filter((entry) => entry.init.headers.Authorization === `Bearer ${token}`).map((entry) => entry.url);
const rowsOf = (document) => document.getElementById('rows').children;

test('a lease list that is not a clean 200 of well-formed lease ids teaches the page nothing: as that conductor it asks for the list and nothing else', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const listing = (items) => JSON.stringify({ outcome: 'ok', total: items.length, offset: 0, limit: 20, items });
  const real = listing([{ id: ids.a.lease }]);
  const FORGED = {
    'a 404 that carries the real list': { status: 404, text: real }, 'a 500 that carries the real list': { status: 500, text: real },
    'a 200 whose body is null': { status: 200, text: 'null' }, 'a 200 that is not JSON': { status: 200, text: 'not json' }, 'a 200 whose body is an array': { status: 200, text: '[]' },
    'a 200 whose items is a string': { status: 200, text: '{"items":"lease-00000001"}' }, 'a 200 whose items is an object': { status: 200, text: '{"items":{}}' },
    'a 200 with a run id among the leases': { status: 200, text: listing([{ id: ids.a.lease }, { id: 'run-12345678' }]) },
    'a 200 with a malformed lease id': { status: 200, text: listing([{ id: ids.a.lease }, { id: 'lease-ZZZZZZZZ' }]) },
    'a 200 with a null item': { status: 200, text: listing([null]) }, 'a 200 with a numeric id': { status: 200, text: listing([{ id: 12345678 }]) }
  };
  for (const [name, forged] of Object.entries(FORGED)) {
    const { document, calls } = await inspect(context, tokens, (answer) => (answer.url === '/v1/leases' && answer.init.headers.Authorization === `Bearer ${tokens['conductor-a']}` ? forged : answer));
    assert.match(document.getElementById('status').textContent, NOTHING, name);
    assert.equal(rowsOf(document).length, 0, `${name}: no row is shown`);
    assert.deepEqual(urlsOf(calls, tokens['conductor-a']), ['/v1/leases'], `${name}: nothing was asked as conductor-a beyond the list`);
  }
  const empty = await inspect(context, tokens, (answer) => (answer.url === '/v1/leases' && answer.init.headers.Authorization === `Bearer ${tokens['conductor-a']}` ? { status: 200, text: listing([]) } : answer));
  assert.match(empty.document.getElementById('status').textContent, NOTHING, 'an empty list teaches nothing either');
  assert.deepEqual(urlsOf(empty.calls, tokens['conductor-a']), ['/v1/leases']);
  const unreachable = await inspect(context, tokens, (answer) => (answer.url === '/v1/leases' && answer.init.headers.Authorization === `Bearer ${tokens['conductor-a']}` ? 'throw' : answer));
  assert.match(unreachable.document.getElementById('status').textContent, NOTHING, 'a network failure teaches nothing');
  assert.deepEqual(urlsOf(unreachable.calls, tokens['conductor-a']), ['/v1/leases']);
}));

test('a list of runs, scratch resources or exports whose first item is not a well-formed id OF THAT KIND teaches the page nothing: the inspection is refused as a whole', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const asA = `Bearer ${tokens['conductor-a']}`;
  const listing = (items) => JSON.stringify({ outcome: 'ok', total: items.length, offset: 0, limit: 20, items });
  for (const [kind, folder] of Object.entries(FOLDERS)) {
    const route = `/v1/leases/${ids.a.lease}/${folder}`;
    const other = kind === 'run' ? 'scratch' : 'run';
    const FORGED = {
      'a 404 that carries the real list': (real) => ({ status: 404, text: real.text }), 'a 200 whose body is null': () => ({ status: 200, text: 'null' }),
      'a 200 whose items is not an array': () => ({ status: 200, text: '{"items":"x"}' }), 'an empty list': () => ({ status: 200, text: listing([]) }),
      'a null first item': () => ({ status: 200, text: listing([null]) }), 'a non-object first item': () => ({ status: 200, text: listing(['x']) }),
      'a numeric id': () => ({ status: 200, text: listing([{ id: 12345678 }]) }), 'an id of another kind': () => ({ status: 200, text: listing([{ id: `${other}-12345678` }]) }),
      'an id that is not hexadecimal': () => ({ status: 200, text: listing([{ id: `${kind}-ZZZZZZZZ` }]) }), 'an id that is too short': () => ({ status: 200, text: listing([{ id: `${kind}-1234567` }]) })
    };
    for (const [name, forge] of Object.entries(FORGED)) {
      const { document, calls } = await inspect(context, tokens, (answer) => (answer.url === route && answer.init.headers.Authorization === asA ? forge(answer) : answer));
      assert.match(document.getElementById('status').textContent, NOTHING, `${kind}: ${name}`);
      assert.equal(rowsOf(document).length, 0, `${kind}: ${name}: no row is shown`);
      assert.deepEqual(urlsOf(calls, tokens['conductor-a']), ['/v1/leases', ...Object.values(FOLDERS).map((entry) => `/v1/leases/${ids.a.lease}/${entry}`)], `${kind}: ${name}: only the four lists were asked as conductor-a`);
    }
  }
}));

test('an own read that is answered 200 with a body naming ANOTHER resource, or a list holding a malformed id, is a violation: every check of a probe needs both of its halves', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const asA = `Bearer ${tokens['conductor-a']}`;
  const body = (extra) => JSON.stringify({ outcome: 'ok', ...extra });
  const CASES = [
    ['read lease', `/v1/leases/${ids.a.lease}`, 0, body({ lease: { id: ids.b.lease } })],
    ['read run', `/v1/leases/${ids.a.lease}/runs/${ids.a.run}`, 0, body({ resource: { id: ids.b.run } })],
    ['read scratch', `/v1/leases/${ids.a.lease}/scratches/${ids.a.scratch}`, 0, body({ resource: { id: ids.b.scratch } })],
    ['read export', `/v1/leases/${ids.a.lease}/exports/${ids.a.export}`, 0, body({ resource: { id: ids.b.export } })],
    ['list runs', `/v1/leases/${ids.a.lease}/runs`, 1, body({ items: [{ id: 'not-an-id' }] })],
    ['list runs', `/v1/leases/${ids.a.lease}/runs`, 1, body({ items: 'x' })]
  ];
  for (const [action, route, nth, text] of CASES) {
    const { document } = await inspect(context, tokens, (answer) => (answer.url === route && answer.init.headers.Authorization === asA && answer.nth === nth ? { status: 200, text } : answer));
    const verdicts = rowsOf(document).filter((row) => row.children[0].textContent === 'conductor-a' && row.children[1].textContent === action && row.children[2].textContent.startsWith('own')).map((row) => row.children[5].attributes['data-outcome']);
    assert.deepEqual(verdicts, ['violation'], `${action}: ${text}`);
    assert.match(document.getElementById('status').textContent, /^Checked 30 rows: 1 violation\(s\)\. Do not trust this server\.$/, action);
  }
}));

test('the absent-control must be a 404 with the typed code: without a trustworthy control no foreign refusal is accepted, and the page says so', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const control = `/v1/leases/${ids.a.lease}/runs/run-ffffffffffffffff`;
  const asB = `Bearer ${tokens['conductor-b']}`;
  const genuine = (await inspect(context, tokens)).calls.length;
  assert.ok(genuine > 0);
  const real = await call(context, tokens['conductor-b'], 'GET', control);
  const FORGED = {
    'a 200 that carries the typed refusal body': { status: 200, text: real.text },
    'a 404 whose body is the typed refusal of another code': { status: 404, text: JSON.stringify({ outcome: 'NOT_FOUND', error: { code: 'NOT_FOUND' } }) },
    'a 404 whose body is not a refusal': { status: 404, text: '{"outcome":"ok"}' }
  };
  for (const [name, forged] of Object.entries(FORGED)) {
    const { document } = await inspect(context, tokens, (answer) => (answer.url === control && answer.init.headers.Authorization === asB ? forged : answer));
    const foreign = rowsOf(document).filter((row) => row.children[2].textContent.startsWith('foreign')).map((row) => row.children[5].attributes['data-outcome']);
    assert.deepEqual(foreign, Array(foreign.length).fill('violation'), `${name}: no foreign row is accepted without a trustworthy control`);
    assert.equal(foreign.length, 10);
    assert.match(document.getElementById('status').textContent, /violation\(s\)\. Do not trust this server\.$/, name);
  }
  const unreached = await inspect(context, tokens, (answer) => (answer.url === control && answer.init.headers.Authorization === asB ? 'throw' : answer));
  assert.equal(rowsOf(unreached.document).filter((row) => row.children[2].textContent.startsWith('foreign')).every((row) => row.children[5].attributes['data-outcome'] === 'violation'), true, 'an unreached control is no control');
}));

test('the outcome of a row is its LAST cell only, and a probe that got no answer is shown as "no answer" with dashes (not as a violation)', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const plain = await inspect(context, tokens);
  assert.deepEqual(plain.calls.filter((entry) => entry.init.headers.Authorization === undefined).map((entry) => entry.url), [`/v1/leases/${ids.a.lease}`], 'the anonymous probe asks for the lease route of conductor-a and nothing else');
  for (const row of rowsOf(plain.document)) {
    assert.equal(row.children.length, 6);
    assert.deepEqual(row.children.slice(0, 5).map((cell) => cell.attributes['data-outcome']), Array(5).fill(undefined), 'only the last cell carries the outcome');
    assert.ok(['allowed', 'forbidden'].includes(row.children[5].attributes['data-outcome']));
    if (row.children[5].attributes['data-outcome'] === 'allowed') assert.deepEqual([row.children[3].textContent, row.children[4].textContent], ['200', 'ok'], 'an allowed row shows 200 and ok');
  }
  const route = `/v1/leases/${ids.a.lease}/scratches/${ids.a.scratch}`;
  for (const status of [500, 201]) {
    const failed = await inspect(context, tokens, (answer) => (answer.url === route && answer.init.headers.Authorization === `Bearer ${tokens['conductor-a']}` ? { status, text: 'oops' } : answer));
    const failedRows = rowsOf(failed.document).filter((row) => row.children[3].textContent === String(status));
    assert.deepEqual(failedRows.map((row) => row.children.map((cell) => cell.textContent)), [['conductor-a', 'read scratch', 'own scratch', String(status), '\u2014', 'violation']], `an answer that is neither typed nor a 200 (${status}) shows its status and a dash`);
  }
  const broken = await inspect(context, tokens, (answer) => (answer.url === route && answer.init.headers.Authorization === `Bearer ${tokens['conductor-a']}` ? 'throw' : answer));
  const unanswered = rowsOf(broken.document).filter((row) => row.children[5].attributes['data-outcome'] === 'no answer');
  assert.equal(unanswered.length, 1, 'exactly the probe that failed');
  assert.deepEqual(unanswered[0].children.map((cell) => cell.textContent), ['conductor-a', 'read scratch', 'own scratch', '\u2014', '\u2014', 'no answer']);
  assert.equal(rowsOf(broken.document).filter((row) => row.children[5].attributes['data-outcome'] === 'violation').length, 0, 'a missing answer is not called a violation');
  assert.match(broken.document.getElementById('status').textContent, /^Checked 30 rows: 1 violation\(s\)\. Do not trust this server\.$/, 'but it is counted and never announced as fine');
}));

test('an inspection that learns nothing clears the table: no row of an earlier inspection stays on screen', () => withApp({}, async (context) => {
  const { tokens } = await seed(context);
  let forgeLearning = false;
  const network = wire(context, (answer) => (forgeLearning && answer.url === '/v1/leases' && answer.init.headers.Authorization === `Bearer ${tokens['conductor-a']}` ? { status: 500, text: '{}' } : answer));
  const { document } = await runPage({ fetch: network.fetch });
  for (const identity of IDENTITIES) document.getElementById(`token-${identity}`).value = tokens[identity];
  await document.getElementById('run').click();
  assert.equal(rowsOf(document).length, 30);
  forgeLearning = true;
  await document.getElementById('run').click();
  assert.match(document.getElementById('status').textContent, NOTHING);
  assert.equal(rowsOf(document).length, 0, 'the 30 rows of the first inspection are gone');
}));

test('every typed refusal code the page knows is shown as such; only AUTHENTICATION_REQUIRED is what an anonymous probe must get', () => withApp({}, async (context) => {
  const { tokens } = await seed(context);
  const codes = ['TARGET_NOT_FOUND', 'ROLE_FORBIDDEN', 'AUTHENTICATION_REQUIRED', 'TOKEN_MALFORMED', 'TOKEN_UNKNOWN', 'TOKEN_EXPIRED', 'NOT_FOUND'];
  for (const code of codes) {
    const { document } = await inspect(context, tokens, (answer) => (answer.init.headers.Authorization === undefined ? { status: 401, text: JSON.stringify({ outcome: code, error: { code } }) } : answer));
    const [row] = rowsOf(document).filter((entry) => entry.children[0].textContent === 'anonymous');
    assert.deepEqual(row.children.slice(3).map((cell) => cell.textContent), ['401', code, code === 'AUTHENTICATION_REQUIRED' ? 'forbidden' : 'violation'], code);
  }
}));
