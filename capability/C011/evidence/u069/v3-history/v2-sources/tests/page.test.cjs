'use strict';

// The inspection page under the DOM stub (the markup is the real index.html, the script the real page.js) against a REAL server over real HTTP, and
// against forged answers: every outcome is derived from status, typed code and the shape and the numbers of the answer, never from prose, and a forged
// answer is a violation shown as such. The shared browser helper allows only GET, so the real Edge observation (tests\browser.cjs) uses the same page.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { SMALL, call } = require('./helpers.cjs');
const { createDocument, runPage } = require('./dom-stub.cjs');
const { startLocal } = require('../server.cjs');

const IDENTITIES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const text = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

async function world() {
  const local = await startLocal({ tokenMs: 600000, config: SMALL });
  const reserve = (who, units, tier, key) => call(local, local.tokens[who], 'POST', '/v1/reservations', { key, tier, units });
  await reserve('conductor-a', 3, 'standard', 'key-page-a-0001');
  await reserve('conductor-b', 2, 'burst', 'key-page-b-0001');
  await reserve('conductor-b', 1, 'standard', 'key-page-b-0002');
  return local;
}

// A fetch for the page: the real server, optionally rewritten per (token, route, n-th call): rewrite returns null to keep the answer, a replacement
// { status, text } to forge it, or throws to make the request fail.
function fetchOf(local, rewrite = () => null) {
  const calls = new Map();
  return async (route, init = {}) => {
    const token = (init.headers?.Authorization ?? '').replace('Bearer ', '');
    const who = Object.entries(local.tokens).find(([, value]) => value === token)?.[0] ?? (token === '' ? 'anonymous' : token);
    const key = `${who} ${route}`;
    const n = (calls.get(key) ?? 0) + 1;
    calls.set(key, n);
    const real = await fetch(local.origin + route, init);
    const body = await real.text();
    const forged = rewrite({ who, route, n, status: real.status, text: body, json: () => JSON.parse(body) });
    const answer = forged ?? { status: real.status, text: body };
    return { status: answer.status, text: async () => answer.text };
  };
}

async function inspect(local, { rewrite, tokens = local.tokens, fetchImpl } = {}) {
  const { document } = await runPage({ fetch: fetchImpl ?? fetchOf(local, rewrite) });
  for (const identity of IDENTITIES) document.getElementById(`token-${identity}`).value = tokens[identity];
  await document.getElementById('run').click();
  const rows = document.getElementById('rows').children.map((tr) => tr.children.map((td) => td.textContent));
  const outcomes = document.getElementById('rows').children.map((tr) => tr.children.at(-1).attributes['data-outcome']);
  const books = Object.fromEntries([...document.elements.keys()].filter((id) => id.startsWith('books-') && id !== 'books-title').map((id) => [id.slice(6), document.getElementById(id).textContent]));
  return { document, rows, outcomes, books, status: document.getElementById('status').textContent, balanced: document.getElementById('books-balanced').attributes['data-balanced'] };
}
const rowOf = (view, identity, action, target) => view.rows.findIndex((cells) => cells[0] === identity && cells[1] === action && cells[2] === target);
const outcomeOf = (view, identity, action, target) => view.outcomes[rowOf(view, identity, action, target)];

test('the real server: 21 rows derived from facts, every conductor reaches its own, nobody reaches a foreign one, the books balance and agree', async () => {
  const local = await world();
  try {
    const view = await inspect(local);
    assert.equal(view.rows.length, 21);
    assert.deepEqual(view.outcomes.reduce((count, outcome) => ({ ...count, [outcome]: (count[outcome] ?? 0) + 1 }), {}), { allowed: 12, forbidden: 9 });
    assert.equal(view.status, 'Checked 21 rows: every conductor reached its own reservations, the books balance and agree with what each conductor reports, and no foreign reservation was reachable by anyone else. Replay keys: conductor-a 1/1000 (999 remaining); conductor-b 2/1000 (998 remaining).');
    assert.deepEqual(view.rows[4], ['conductor-a', 'read allowance', 'own caps', '200', 'ok', 'allowed']);
    assert.deepEqual(view.rows.filter((cells) => cells[2] === 'foreign reservation'), [['conductor-a', 'read reservation', 'foreign reservation', '404', 'RESERVATION_NOT_FOUND', 'forbidden'], ['conductor-b', 'read reservation', 'foreign reservation', '404', 'RESERVATION_NOT_FOUND', 'forbidden']]);
    assert.deepEqual(view.rows[rowOf(view, 'anonymous', 'read allowance', 'conductor routes')], ['anonymous', 'read allowance', 'conductor routes', '401', 'AUTHENTICATION_REQUIRED', 'forbidden']);
    const snapshot = local.app.snapshot();
    assert.deepEqual(view.books, {
      'pool-units': '10', 'pool-spend': '60', 'reserved-units': String(snapshot.reserved.units), 'reserved-spend': String(snapshot.reserved.spend), 'free-units': String(10 - snapshot.reserved.units),
      'free-spend': String(60 - snapshot.reserved.spend), 'a-units': '3', 'a-spend': '12', 'b-units': '3', 'b-spend': '20',
      balanced: 'yes: the pool is reserved plus free, and each conductor reports the share the operator shows'
    });
    assert.equal(view.balanced, 'yes');
    const ids = [...view.document.elements.keys()];
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(view.rows.every((cells) => cells.length === 6));
  } finally {
    await local.close();
  }
});

test('the markup: strict, no inline script, one live region, every id unique and every id the script asks for is declared', () => {
  const html = text('index.html');
  assert.equal((html.match(/<script\b/g) ?? []).length, 1);
  assert.match(html, /<script src="\/page\.js"><\/script>/);
  assert.equal(/<script>|\son[a-z]+=|\sstyle=/.test(html), false);
  assert.equal((html.match(/role="status"/g) ?? []).length, 1);
  assert.match(html, /<td id="books-balanced" colspan="2" data-balanced="unknown">/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const document = createDocument();
  assert.equal(document.getElementById('status').textContent, 'Not inspected yet. Nothing is shown as allowed until the server says so.');
  assert.throws(() => document.getElementById('nope'), /NO_SUCH_ELEMENT_IN_INDEX_HTML/);
  const script = text('page.js');
  for (const match of script.matchAll(/byId\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), match[1]);
  for (const identity of IDENTITIES) assert.ok(ids.includes(`token-${identity}`));
});

test('server prose never matters: every message is replaced and every outcome stays', async () => {
  const local = await world();
  try {
    const plain = await inspect(local);
    const worded = await inspect(local, { rewrite: ({ status, json }) => { const body = json(); if (!body.error) return null; body.error.message = 'Everything is fine!'; return { status, text: JSON.stringify(body) }; } });
    assert.deepEqual([worded.rows, worded.outcomes], [plain.rows, plain.outcomes]);
  } finally {
    await local.close();
  }
});

const FORGERIES = [
  ['a foreign reservation answered 200', ({ who, route, status }) => (who === 'conductor-a' && /reservations\/rsv-/.test(route) && status === 404 && !route.endsWith('ffffffffffffffff') ? { status: 200, text: JSON.stringify({ outcome: 'ok', reservation: { id: 'rsv-00000001' } }) } : null), ['conductor-a', 'read reservation', 'foreign reservation'], 'violation'],
  ['a foreign answer that differs from the absent control', ({ who, route, status, json }) => (who === 'conductor-b' && /reservations\/rsv-/.test(route) && status === 404 && !route.endsWith('ffffffffffffffff') ? { status: 404, text: JSON.stringify({ ...json(), extra: 1 }) } : null), ['conductor-b', 'read reservation', 'foreign reservation'], 'violation'],
  ['a conductor answered the operator books', ({ who, route, json }) => (who === 'conductor-a' && route === '/v1/operator/pool' ? { status: 200, text: JSON.stringify({ outcome: 'ok', pool: {}, leases: [] }) } : null), ['conductor-a', 'read pool books', 'operator route'], 'violation'],
  ['a visitor answered the allowance', ({ who, route }) => (who === 'visitor' && route === '/v1/allowance' ? { status: 200, text: '{"outcome":"ok"}' } : null), ['visitor', 'read allowance', 'conductor routes'], 'violation'],
  ['an anonymous request answered', ({ who, route }) => (who === 'anonymous' ? { status: 200, text: '{"outcome":"ok"}' } : null), ['anonymous', 'read allowance', 'conductor routes'], 'violation'],
  ['a visitor refused with the wrong code', ({ who, route, json }) => (who === 'visitor' && route === '/v1/allowance' ? { status: 403, text: JSON.stringify({ ...json(), outcome: 'NOT_FOUND', error: { code: 'NOT_FOUND', message: 'x' } }) } : null), ['visitor', 'read allowance', 'conductor routes'], 'violation'],
  ['the wrong subject in who am I', ({ who, route, json }) => (who === 'operator' && route === '/v1/me' ? { status: 200, text: JSON.stringify({ ...json(), subject: 'conductor-a' }) } : null), ['operator', 'who am I', 'itself'], 'violation'],
  ['an allowance that shows the pool headroom', ({ who, route, n, json }) => (who === 'conductor-a' && route === '/v1/allowance' && n === 2 ? { status: 200, text: JSON.stringify({ ...json(), allowance: { ...json().allowance, pool: { units: 10, spend: 60, free: 4 } } }) } : null), ['conductor-a', 'read allowance', 'own caps'], 'violation'],
  ['an allowance whose remaining figure is wrong', ({ who, route, n, json }) => { if (!(who === 'conductor-b' && route === '/v1/allowance' && n === 2)) return null; const body = json(); body.allowance.lease.remainingUnits += 1; return { status: 200, text: JSON.stringify(body) }; }, ['conductor-b', 'read allowance', 'own caps'], 'violation'],
  ['a list with a wrong spend', ({ who, route, n, json }) => { if (!(who === 'conductor-a' && route === '/v1/reservations?limit=50' && n === 2)) return null; const body = json(); body.items[0].spend += 1; return { status: 200, text: JSON.stringify(body) }; }, ['conductor-a', 'list reservations', 'own list'], 'violation'],
  ['a list whose total is below its items', ({ who, route, n, json }) => { if (!(who === 'conductor-b' && route === '/v1/reservations?limit=50' && n === 2)) return null; const body = json(); body.total = 0; return { status: 200, text: JSON.stringify(body) }; }, ['conductor-b', 'list reservations', 'own list'], 'violation'],
  ['a reservation in a state outside the three', ({ who, route, json }) => { if (!(who === 'conductor-a' && /reservations\/rsv-/.test(route) && route !== '/v1/reservations/rsv-ffffffffffffffff')) return null; const body = json(); if (!body.reservation) return null; body.reservation.state = 'spent'; return { status: 200, text: JSON.stringify(body) }; }, ['conductor-a', 'read reservation', 'own reservation'], 'violation'],
  ['books that do not balance', ({ who, route, json }) => { if (!(who === 'operator' && route === '/v1/operator/pool')) return null; const body = json(); body.pool.freeUnits += 1; return { status: 200, text: JSON.stringify(body) }; }, ['operator', 'read pool books', 'operator route'], 'violation'],
  ['a share the conductor does not report', ({ who, route, json }) => { if (!(who === 'operator' && route === '/v1/operator/pool')) return null; const body = json(); body.leases[0].heldUnits -= 1; body.pool.reservedUnits -= 1; body.pool.freeUnits += 1; return { status: 200, text: JSON.stringify(body) }; }, ['operator', 'read pool books', 'operator route'], 'violation'],
  ['an answer that is not JSON', ({ who, route }) => (who === 'operator' && route === '/v1/operator/audit' ? { status: 200, text: '<html>fine</html>' } : null), ['operator', 'read audit', 'operator route'], 'violation']
];

for (const [label, rewrite, [identity, action, target], expected] of FORGERIES) {
  test(`a forged answer is a violation, never shown as fine: ${label}`, async () => {
    const local = await world();
    try {
      const view = await inspect(local, { rewrite });
      assert.equal(outcomeOf(view, identity, action, target), expected, JSON.stringify(view.rows.filter((cells) => cells[5] === 'violation')));
      assert.match(view.status, /^Checked 21 rows: [1-9][0-9]* violation\(s\)\. Do not trust this server\.$/);
      if (['books that do not balance', 'a share the conductor does not report'].includes(label)) assert.equal(view.balanced, 'no');
    } finally {
      await local.close();
    }
  });
}

test('the same token for both conductors, a forged visitor token, a failing fetch and an empty world are shown as what they are', async () => {
  const local = await world();
  try {
    const swapped = await inspect(local, { tokens: { ...local.tokens, 'conductor-a': local.tokens['conductor-b'] } });
    assert.match(swapped.status, /^Checked 21 rows: [1-9][0-9]* violation\(s\)\. Do not trust this server\.$/);
    assert.ok(swapped.outcomes.includes('violation'));
    const forged = await inspect(local, { tokens: { ...local.tokens, visitor: `c009_${'A'.repeat(43)}` } });
    assert.deepEqual(forged.rows[0], ['visitor', 'who am I', 'itself', '401', 'TOKEN_UNKNOWN', 'violation']);
    const dead = await inspect(local, { rewrite: ({ who, route }) => { if (who === 'operator' && route === '/v1/operator/audit') throw new Error('network down'); return null; } });
    assert.deepEqual(dead.rows[rowOf(dead, 'operator', 'read audit', 'operator route')], ['operator', 'read audit', 'operator route', '\u2014', '\u2014', 'no answer']);
    assert.match(dead.status, /1 violation\(s\)/);
    const none = await inspect(local, { fetchImpl: async () => { throw new Error('offline'); } });
    assert.equal(none.rows.length, 0);
    assert.equal(none.status, 'Nothing to inspect: no reservation was listed for conductor-a and conductor-b. Nothing is shown as allowed.');
  } finally {
    await local.close();
  }
  const empty = await startLocal({ tokenMs: 600000, config: SMALL });
  try {
    const view = await inspect(empty);
    assert.equal(view.status, 'Nothing to inspect: no reservation was listed for conductor-a and conductor-b. Nothing is shown as allowed.');
    assert.equal(view.rows.length, 0);
  } finally {
    await empty.close();
  }
});
