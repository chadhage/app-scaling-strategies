'use strict';

// page.js under a DOM stub built from the real index.html, with `fetch` bridged to the REAL server over loopback sockets (so the page's
// verdicts are derived from real answers), and with tampered answers to prove that a forged answer is never shown as isolated or allowed.
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { call, startApp } = require('./helpers.cjs');
const { createDocument, flush, loadPage } = require('./dom-stub.cjs');
const contract = require('../contract.js');

let ctx;
let tokens;
before(async () => {
  ctx = await startApp();
  tokens = {
    ada: (await ctx.session('ada')).token, bea: (await ctx.session('bea')).token, ben: (await ctx.session('ben')).token, cai: (await ctx.session('cai')).token,
    ana: (await ctx.session('ana')).token, bo: (await ctx.session('bo')).token
  };
});
after(async () => { await ctx.close(); });

// A fetch that goes to the real server. tamper(path, headers, result) may rewrite an answer before the page sees it.
function bridge({ tamper, log = [] } = {}) {
  const fetch = async (path, init) => {
    log.push({ path, init });
    const headers = Object.fromEntries(Object.entries(init.headers).filter(([name]) => name !== 'Authorization'));
    const res = await call(ctx.port, init.method, path, { token: init.headers.Authorization.replace('Bearer ', ''), headers });
    let result = { status: res.status, text: res.text, etag: res.headers.etag || null };
    if (tamper) result = tamper(path, init.headers, result) || result;
    if (result.throws) throw new Error('network down');
    return { status: result.status, text: async () => result.text, headers: { get: (name) => (name.toLowerCase() === 'etag' ? result.etag : null) } };
  };
  return { fetch, log };
}

async function run(a, b, options = {}) {
  const { fetch, log } = bridge(options);
  const document = createDocument();
  loadPage({ fetch, document, extra: options.extra });
  document.getElementById('token-a').value = a;
  document.getElementById('token-b').value = b;
  await document.getElementById('run').click();
  await flush();
  const rows = document.getElementById('rows').children.map((tr) => tr.children.map((td) => ({ text: td.textContent, className: td.className })));
  return { document, rows, log, status: document.getElementById('status').textContent, facts: document.getElementById('facts').textContent };
}
const col = (rows, probe, caller) => rows.filter((row) => row[0].text === probe && (!caller || row[1].text.startsWith(caller)));

test('two users of two tenants: every probe is answered as specified and the verdict is derived from facts', async () => {
  const { rows, status, facts, log } = await run(tokens.ada, tokens.bea);
  assert.match(status, /^Isolation holds between tenant-alder and tenant-birch: (\d+) of \1 checks as specified\.$/);
  assert.equal(rows.length, Number(/Observed (\d+) checks/.exec(facts)[1]), 'the rows and the facts line reconcile');
  assert.match(facts, /^Observed \d+ checks: \d+ as specified, 0 not\.$/);
  assert.ok(rows.every((row) => row.length === 5 && row[4].className === 'ok'), 'every verdict is ok');
  assert.ok(log.every(({ init }) => init.method === 'GET' && init.credentials === 'omit' && init.cache === 'no-store'), 'GET only, no credentials channel, no cache');
  const [foreignFromBirch] = col(rows, 'foreign project id', 'bea');
  assert.equal(foreignFromBirch[2].text, '404');
  assert.equal(foreignFromBirch[3].text, 'refused RESOURCE_NOT_FOUND');
  assert.deepEqual(col(rows, 'foreign project id', 'ada')[0].slice(2, 4).map((cell) => cell.text), ['-', '-'], 'alder has no id that birch lacks, so nothing was asked');
  assert.match(col(rows, 'foreign project id', 'ada')[0][4].text, /^n\/a/);
  assert.equal(col(rows, 'tenant claimed in a header').every((row) => row[2].text === '400' && row[3].text === 'refused TENANT_CLAIM_REJECTED'), true);
  assert.equal(col(rows, 'tenant claimed in the query').length, 2);
  assert.equal(col(rows, 'ETag of the other tenant').every((row) => row[2].text === '200' && row[3].text === 'allowed'), true);
  assert.equal(col(rows, 'search for the other tenant').length, 2);
  assert.deepEqual(col(rows, 'foreign profile id').map((row) => row[2].text), ['404', '404']);
  const texts = rows.flat().map((cell) => cell.text).join('\n');
  for (const [, message] of Object.values(contract.CODES)) assert.equal(texts.includes(message), false, 'no server prose is ever shown');
  assert.equal(new Set(log.filter(({ path }) => path.startsWith('/v1/projects/')).map(({ path }) => path)).size >= 3, true);
});

test('the DOM invariants hold after a run: unique ids, a row per check, a single live status, the button enabled again', async () => {
  const { document, rows } = await run(tokens.ben, tokens.ada);
  assert.equal(document.getElementById('run').disabled, false);
  assert.equal(document.getElementById('status').tagName, 'p');
  assert.ok(rows.length >= 12);
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  assert.equal([...html.matchAll(/role="status"/g)].length, 1, 'one polite live region');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'no inline script');
  assert.doesNotMatch(html, /\son\w+=/i, 'no inline handler');
  assert.doesNotMatch(html, /style=/i, 'no inline style');
});

test('a tenant with nothing to compare is handled: an empty tenant, no foreign-only ids, no profiles', async () => {
  const empty = await run(tokens.cai, tokens.ada);
  assert.match(empty.status, /^Isolation holds between tenant-cedar and tenant-alder/);
  assert.ok(empty.rows.every((row) => row[4].className === 'ok'));
  assert.equal(col(empty.rows, 'own project', 'cai').length, 0, 'cedar owns no project to read');
  assert.equal(col(empty.rows, 'search for the other tenant', 'ada').length, 0, 'nothing to search for when the other tenant is empty');
  assert.match(col(empty.rows, 'foreign profile id', 'ada')[0][4].text, /^n\/a/);
});

test('bad input: no token or a malformed one sends nothing; two tokens of the SAME tenant cannot be compared', async () => {
  const none = await run('', '');
  assert.equal(none.log.length, 0);
  assert.match(none.status, /^Paste a well-formed session token for each user/);
  const half = await run(tokens.ada, 'garbage');
  assert.equal(half.log.length, 0);
  assert.equal(half.rows.length, 0);
  const same = await run(tokens.ada, tokens.ana);
  assert.match(same.status, /^Not verified or NOT isolated: 1 of \d+ checks failed\.$/);
  assert.equal(col(same.rows, 'cross probes')[0][4].text, 'not run: both tokens belong to the same tenant');
  assert.equal(col(same.rows, 'cross probes')[0][4].className, 'bad');
});

test('a forged answer is never shown as isolated or allowed (a leak, a status and code that disagree, a failing network, a 304, a wrong count)', async () => {
  const leak = await run(tokens.bea, tokens.ada, { tamper: (path, headers, result) => (path === '/v1/projects/proj-0003' ? { status: 200, text: JSON.stringify({ outcome: 'ok', project: { id: 'proj-0003', name: 'alder-meadow' } }), etag: '"x"' } : null) });
  assert.match(leak.status, /^Not verified or NOT isolated/);
  assert.equal(col(leak.rows, 'foreign project id', 'bea')[0][4].className, 'bad');
  const mismatch = await run(tokens.bea, tokens.ada, { tamper: (path) => (path === '/v1/projects/proj-0003' ? { status: 404, text: JSON.stringify({ outcome: 'TENANT_CLAIM_REJECTED', error: { code: 'TENANT_CLAIM_REJECTED' } }), etag: null } : null) });
  assert.equal(col(mismatch.rows, 'foreign project id', 'bea')[0][3].text, 'untrusted');
  assert.equal(col(mismatch.rows, 'foreign project id', 'bea')[0][4].className, 'bad');
  const down = await run(tokens.ada, tokens.bea, { tamper: (path) => (path === '/v1/session' ? { throws: true } : null) });
  assert.match(down.status, /^Not verified or NOT isolated/);
  assert.equal(down.rows[0][2].text, '0');
  assert.equal(down.rows[0][3].text, 'untrusted');
  const notModified = await run(tokens.ada, tokens.bea, { tamper: (path, headers) => (headers['If-None-Match'] ? { status: 304, text: '', etag: null } : null) });
  assert.equal(col(notModified.rows, 'ETag of the other tenant').some((row) => row[4].className === 'bad' && row[3].text === 'not-modified'), true);
  const count = await run(tokens.ada, tokens.bea, { tamper: (path) => (path.startsWith('/v1/projects?q=') ? { status: 200, text: JSON.stringify({ outcome: 'ok', items: [], count: 99 }), etag: null } : null) });
  assert.equal(col(count.rows, 'search for the other tenant').some((row) => row[4].className === 'bad'), true);
  const stranger = await run(tokens.ada, tokens.bea, { tamper: (path) => (path === '/v1/session' ? { status: 200, text: JSON.stringify({ outcome: 'ok', session: { state: 'active', tenant: 'tenant-evil', user: 'ada', role: 'admin' } }), etag: null } : null) });
  assert.equal(col(stranger.rows, 'who am I')[0][4].className, 'bad');
  const badList = await run(tokens.ada, tokens.bea, { tamper: (path) => (path.startsWith('/v1/projects?limit') ? { status: 200, text: JSON.stringify({ outcome: 'ok', items: [{ id: 'x', name: 5 }], count: 1 }), etag: null } : null) });
  assert.match(badList.status, /^Not verified or NOT isolated/);
  const badProfiles = await run(tokens.ada, tokens.bea, { tamper: (path) => (path === '/v1/profiles' ? { status: 200, text: JSON.stringify({ outcome: 'ok', profiles: [{ x: 1 }] }), etag: null } : null) });
  assert.ok(badProfiles.rows.length > 0);
});

test('the run is bound: a second click while a run is in flight is ignored, the timeout signal is used when the platform has one', async () => {
  const { fetch, log } = bridge();
  const document = createDocument();
  loadPage({ fetch, document, extra: { AbortSignal: { timeout: (ms) => ({ aborted: false, ms }) } } });
  document.getElementById('token-a').value = tokens.ada;
  document.getElementById('token-b').value = tokens.bea;
  const first = document.getElementById('run').click();
  const second = document.getElementById('run').click();
  await Promise.all([first, second]);
  await flush();
  assert.equal(log.filter(({ path }) => path === '/v1/session').length, 2, 'one run: two whoami requests, not four');
  assert.ok(log.every(({ init }) => init.signal && init.signal.ms === 8000), 'every request carries the timeout signal');
  assert.equal(document.getElementById('run').disabled, false);
});

test('page.js asks only for ids that index.html declares, and never for another element', () => {
  const document = createDocument();
  loadPage({ fetch: async () => { throw new Error('unused'); }, document });
  assert.deepEqual([...document.requested].sort(), ['facts', 'rows', 'run', 'status', 'token-a', 'token-b']);
});
