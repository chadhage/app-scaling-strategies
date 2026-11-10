'use strict';

// What the systematic mutants of page.js found that page.test.cjs does not pin (written after the first mutation pass; page.test.cjs was not
// edited): the closed validation of each answer the page reads (session, list, profiles), the classification of an answer (status, typed code and
// error object must agree), every precondition of the cross probes, the verdict of a probe whose answer is forged, the fallbacks, the exact
// requests, and the state of the page while a run is in flight. page.js runs under the DOM stub with fetch bridged to the REAL server; a forged
// answer replaces exactly one real answer.
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { call, startApp } = require('./helpers.cjs');
const { createDocument, flush, loadPage } = require('./dom-stub.cjs');
const contract = require('../contract.js');

let ctx;
let tokens;
before(async () => {
  ctx = await startApp();
  tokens = { ada: (await ctx.session('ada')).token, bea: (await ctx.session('bea')).token };
});
after(async () => { await ctx.close(); });

const tokenOf = (init) => init.headers.Authorization.replace('Bearer ', '');
const reply = (status, body, etag = null) => ({ status, text: typeof body === 'string' ? body : JSON.stringify(body), etag });
const refusal = (code, extra = {}) => reply(contract.CODES[code][0], { outcome: code, error: { code, message: contract.CODES[code][1] }, ...extra });
const statusOf = (code) => String(contract.CODES[code][0]);

// request = { path, who, headers, result }; the tamper returns a replacement answer or nothing. forge() replaces the FIRST matching answer.
const forge = (match, make) => {
  let used = false;
  return (request) => {
    if (used || !match(request)) return undefined;
    used = true;
    return make(request.result);
  };
};
const asks = (who, path) => (request) => request.who === who && request.path === path;
const lists = (who) => (request) => request.who === who && request.path.startsWith('/v1/projects?limit');
const ownRead = (who) => (request) => request.who === who && request.path === '/v1/projects/proj-0001' && !('If-None-Match' in request.headers);

// A GET of this static world always gets the same answer: the first time a request is made it goes to the REAL server over a socket, later runs replay
// that real answer from memory (the page is a function of the answers it reads, so a forged scenario needs no new socket). A request never made before
// (an id the page learned from a forged list) goes to the real server too.
const recorded = new Map();
function bridge({ tamper, observe, document }) {
  const log = [];
  const fetch = async (path, init) => {
    const headers = Object.fromEntries(Object.entries(init.headers).filter(([name]) => name !== 'Authorization'));
    const who = tokenOf(init) === tokens.ada ? 'ada' : 'bea';
    log.push({ path, who, headers });
    observe?.(path, document);
    const key = `${who} ${path} ${JSON.stringify(headers)}`;
    if (!recorded.has(key)) {
      const res = await call(ctx.port, init.method, path, { token: tokenOf(init), headers });
      recorded.set(key, { status: res.status, text: res.text, etag: res.headers.etag || null });
    }
    let result = { ...recorded.get(key) };
    result = tamper?.({ path, who, headers, result }) || result;
    if (result.throws) throw new Error('network down');
    return { status: result.status, text: async () => result.text, headers: { get: (name) => (name.toLowerCase() === 'etag' ? result.etag : null) } };
  };
  return { fetch, log };
}
const rowsOf = (document) => document.getElementById('rows').children.map((tr) => tr.children.map((td) => ({ text: td.textContent, className: td.className })));
const texts = (row) => row.map((cell) => cell.text);
const find = (rows, probe, who) => rows.filter((row) => row[0].text === probe && row[1].text.startsWith(who));

async function click(document, first, second) {
  document.getElementById('token-a').value = first;
  document.getElementById('token-b').value = second;
  await document.getElementById('run').click();
  await flush();
}
async function run(first, second, options = {}) {
  const document = createDocument();
  const { fetch, log } = bridge({ ...options, document });
  loadPage({ fetch, document });
  await click(document, first, second);
  return { document, log, rows: rowsOf(document), status: document.getElementById('status').textContent, facts: document.getElementById('facts').textContent };
}

const NOT_RUN = ['cross probes', 'unknown', '-', '-', 'not run: an answer above was not valid'];
const FAILED_TWO = 'Not verified or NOT isolated: 2 of 5 checks failed.';
const OK_STATUS = 'Isolation holds between tenant-alder and tenant-birch: 19 of 19 checks as specified.';

test('the baseline: nineteen checks as specified, and the exact requests the page makes', async () => {
  const { rows, status, facts, log } = await run(tokens.ada, tokens.bea);
  assert.equal(status, OK_STATUS);
  assert.equal(facts, 'Observed 19 checks: 19 as specified, 0 not.');
  assert.deepEqual(texts(rows[0]), ['who am I', 'ada @ tenant-alder', '200', 'allowed', 'an active session of a known tenant and role']);
  assert.deepEqual(texts(rows[1]), ['list my projects', 'ada @ tenant-alder', '200', 'allowed', '3 project(s) listed']);
  assert.ok(rows.every((row) => row.length === 5 && row[4].className === 'ok'));
  assert.ok(rows.every((row) => row.slice(0, 4).every((cell) => cell.className === '')), 'only the verdict cell carries a class');
  assert.deepEqual(log.slice(0, 6).map(({ who, path }) => `${who} ${path}`), ['ada /v1/session', 'ada /v1/projects?limit=10', 'ada /v1/profiles', 'bea /v1/session', 'bea /v1/projects?limit=10', 'bea /v1/profiles']);
  assert.deepEqual(log.filter(({ headers }) => 'X-Tenant' in headers).map(({ who, path, headers }) => [who, path, headers['X-Tenant']]), [['ada', '/v1/projects', 'tenant-birch'], ['bea', '/v1/projects', 'tenant-alder']]);
  assert.deepEqual(log.filter(({ path }) => path.includes('tenant=')).map(({ who, path }) => [who, path]), [['ada', '/v1/projects?tenant=tenant-birch'], ['bea', '/v1/projects?tenant=tenant-alder']]);
  assert.deepEqual(log.filter(({ path }) => path.startsWith('/v1/projects?q=')).map(({ who, path }) => [who, path]), [['ada', '/v1/projects?q=birch'], ['bea', '/v1/projects?q=alder']]);
  assert.deepEqual(log.filter(({ path }) => path.startsWith('/v1/profiles/')).map(({ who, path }) => [who, path]), [['ada', '/v1/profiles/synthetic-002'], ['ada', '/v1/profiles/synthetic-999'], ['bea', '/v1/profiles/synthetic-001'], ['bea', '/v1/profiles/synthetic-999']]);
  assert.deepEqual(log.filter(({ headers }) => 'If-None-Match' in headers).map(({ who, headers }) => [who, headers['If-None-Match'].startsWith('"')]), [['ada', true], ['bea', true]]);
});

// An answer is allowed, refused or untrusted by what it says, never by what it claims.
const CLASSIFIED = [
  ['a 304', reply(304, ''), '304', 'not-modified'],
  ['a typed refusal that agrees with the table', refusal('TOKEN_UNKNOWN'), statusOf('TOKEN_UNKNOWN'), 'refused TOKEN_UNKNOWN'],
  ['a refusal code with the status of ok', reply(200, { outcome: 'TOKEN_UNKNOWN', error: { code: 'TOKEN_UNKNOWN' } }), '200', 'untrusted'],
  ['a refusal without an error object', reply(contract.CODES.TOKEN_UNKNOWN[0], { outcome: 'TOKEN_UNKNOWN' }), statusOf('TOKEN_UNKNOWN'), 'untrusted'],
  ['a refusal whose error code differs', reply(contract.CODES.TOKEN_UNKNOWN[0], { outcome: 'TOKEN_UNKNOWN', error: { code: 'TOKEN_MALFORMED' } }), statusOf('TOKEN_UNKNOWN'), 'untrusted'],
  ['an outcome that is not in the table', reply(200, { outcome: 'fine' }), '200', 'untrusted'],
  ['an outcome that is not a string', reply(200, { outcome: 5 }), '200', 'untrusted'],
  ['an inherited property name as the outcome', reply(200, { outcome: 'constructor', error: { code: 'constructor' } }), '200', 'untrusted'],
  ['ok with another status', reply(201, { outcome: 'ok', items: [], count: 0 }), '201', 'untrusted'],
  ['a body that is not JSON', reply(200, 'not json'), '200', 'untrusted'],
  ['JSON null', reply(200, 'null'), '200', 'untrusted'],
  ['an empty body', reply(200, ''), '200', 'untrusted']
];
for (const [name, forged, status, outcome] of CLASSIFIED) {
  test(`classification: ${name} is "${outcome}" and is never a valid list`, async () => {
    const { rows, status: line } = await run(tokens.ada, tokens.bea, { tamper: forge(lists('ada'), () => forged) });
    assert.deepEqual(texts(rows[1]), ['list my projects', 'ada @ tenant-alder', status, outcome, 'not a valid list answer']);
    assert.equal(rows[1][4].className, 'bad');
    assert.deepEqual(texts(rows[4]), NOT_RUN);
    assert.equal(rows.length, 5);
    assert.equal(line, FAILED_TWO);
  });
}

// The identity is taken only from an active session of a known tenant, user and role.
const SESSIONS = [
  ['an ended session', (json) => { json.session.state = 'logged_out'; }],
  ['a tenant outside the closed list', (json) => { json.session.tenant = 'tenant-evil'; }],
  ['a user outside the closed list', (json) => { json.session.user = 'mallory'; }],
  ['a role outside the closed list', (json) => { json.session.role = 'root'; }],
  ['no session at all', (json) => { delete json.session; }]
];
for (const [position, who] of [['first', 'ada'], ['second', 'bea']]) {
  const at = position === 'first' ? 0 : 2;
  // The validators are shared by both callers: every variant runs for the first, one variant and the refusal for the second.
  for (const [name, edit] of position === 'first' ? SESSIONS : SESSIONS.slice(0, 1)) {
    test(`identity of the ${position} caller: ${name} is not an identity and nothing is compared`, async () => {
      const forged = (result) => { const json = JSON.parse(result.text); edit(json); return reply(200, json); };
      const { rows, status, facts } = await run(tokens.ada, tokens.bea, { tamper: forge(asks(who, '/v1/session'), forged) });
      assert.deepEqual(texts(rows[at]), ['who am I', 'unknown', '200', 'allowed', 'not a valid session answer']);
      assert.equal(rows[at][4].className, 'bad');
      assert.deepEqual(texts(rows[4]), NOT_RUN);
      assert.equal(rows.length, 5);
      assert.equal(status, FAILED_TWO);
      assert.equal(facts, 'Observed 5 checks: 3 as specified, 2 not.');
    });
  }
  test(`identity of the ${position} caller: a typed refusal instead of a session is shown as refused and is not an identity`, async () => {
    const { rows } = await run(tokens.ada, tokens.bea, { tamper: forge(asks(who, '/v1/session'), () => refusal('TOKEN_UNKNOWN')) });
    assert.deepEqual(texts(rows[at]), ['who am I', 'unknown', statusOf('TOKEN_UNKNOWN'), 'refused TOKEN_UNKNOWN', 'not a valid session answer']);
    assert.deepEqual(texts(rows[4]), NOT_RUN);
  });
}

// The list is accepted only with an array of items, an integer count and a project id and a string name in every item.
const LISTS = [
  ['items that are not an array', { outcome: 'ok', items: 'x', count: 1 }],
  ['a count that is not an integer', { outcome: 'ok', items: [], count: 1.5 }],
  ['a count that is a string', { outcome: 'ok', items: [], count: '0' }],
  ['no count', { outcome: 'ok', items: [] }],
  ['an item that is null', { outcome: 'ok', items: [null], count: 1 }],
  ['an item whose id is not a project id', { outcome: 'ok', items: [{ id: 'x', name: 'n' }], count: 1 }],
  ['an item whose id has three digits', { outcome: 'ok', items: [{ id: 'proj-123', name: 'n' }], count: 1 }],
  ['an item whose id has trailing text', { outcome: 'ok', items: [{ id: 'proj-0001x', name: 'n' }], count: 1 }],
  ['an item whose id has leading text', { outcome: 'ok', items: [{ id: 'xproj-0001', name: 'n' }], count: 1 }],
  ['an item whose name is not a string', { outcome: 'ok', items: [{ id: 'proj-0001', name: 5 }], count: 1 }],
  ['one good and one bad item', { outcome: 'ok', items: [{ id: 'proj-0001', name: 'n' }, { id: 'nope', name: 'n' }], count: 2 }]
];
for (const [position, who, label] of [['first', 'ada', 'ada @ tenant-alder'], ['second', 'bea', 'bea @ tenant-birch']]) {
  const at = position === 'first' ? 1 : 3;
  for (const [name, body] of position === 'first' ? LISTS : LISTS.slice(0, 1)) {
    test(`list of the ${position} caller: ${name} is not a list and nothing is compared`, async () => {
      const { rows, status } = await run(tokens.ada, tokens.bea, { tamper: forge(lists(who), () => reply(200, body)) });
      assert.deepEqual(texts(rows[at]), ['list my projects', label, '200', 'allowed', 'not a valid list answer']);
      assert.equal(rows[at][4].className, 'bad');
      assert.deepEqual(texts(rows[4]), NOT_RUN);
      assert.equal(status, FAILED_TWO);
    });
  }
}
test('a project id of four or more digits and any string name make a valid list', async () => {
  const { rows } = await run(tokens.ada, tokens.bea, { tamper: forge(lists('ada'), () => reply(200, { outcome: 'ok', items: [{ id: 'proj-12345', name: 'alder-x' }], count: 1 })) });
  assert.deepEqual(texts(rows[1]), ['list my projects', 'ada @ tenant-alder', '200', 'allowed', '1 project(s) listed']);
  assert.equal(rows[1][4].className, 'ok');
});

// A profile list that is not valid is no list: the page then treats every profile of the other tenant as foreign (and never throws).
const N_A = 'n/a: the other tenant has no profile this tenant lacks';
const BOTH = [{ profile: { id: 'synthetic-001' } }, { profile: { id: 'synthetic-002' } }];
const PROFILES = [
  ['a typed refusal', () => refusal('TOKEN_UNKNOWN')],
  ['profiles that are not an array', () => reply(200, { outcome: 'ok', profiles: 'x' })],
  ['an entry that is null', () => reply(200, { outcome: 'ok', profiles: [null] })],
  ['an entry without a profile', () => reply(200, { outcome: 'ok', profiles: [{}] })],
  ['an entry whose profile has no id', () => reply(200, { outcome: 'ok', profiles: [{ profile: {} }] })],
  ['an entry whose profile id is not a string', () => reply(200, { outcome: 'ok', profiles: [{ profile: { id: 5 } }] })],
  ['an untrusted answer (an outcome that is not ok) that carries both profiles', () => reply(200, { outcome: 'fine', profiles: BOTH })],
  ['an untrusted answer (another status) that carries both profiles', () => reply(201, { outcome: 'ok', profiles: BOTH })]
];
for (const [position, who, other, foreignOf] of [['first', 'ada', 'bea', 'synthetic-002'], ['second', 'bea', 'ada', 'synthetic-001']]) {
  for (const [name, make] of PROFILES.filter((_, index) => position === 'first' || index === 0 || index >= 6)) {
    test(`profiles of the ${position} caller: ${name} is no list; the run completes and is judged as before`, async () => {
      const { rows, status, log } = await run(tokens.ada, tokens.bea, { tamper: forge(asks(who, '/v1/profiles'), make) });
      assert.equal(rows.length, 19);
      assert.equal(status, OK_STATUS);
      assert.deepEqual(log.filter(({ path }) => path === `/v1/profiles/${foreignOf}`).map(({ who: by }) => by), [who], 'the caller with no valid list asks for the first profile of the other tenant');
      assert.deepEqual(texts(find(rows, 'foreign profile id', other)[0]).slice(1), [`${other === 'ada' ? 'ada @ tenant-alder' : 'bea @ tenant-birch'}`, '-', '-', N_A]);
    });
  }
}
test('a caller that already has the profile of the other tenant has no foreign profile to ask for', async () => {
  const both = reply(200, { outcome: 'ok', profiles: BOTH });
  const { rows, log } = await run(tokens.ada, tokens.bea, { tamper: forge(asks('ada', '/v1/profiles'), () => both) });
  assert.deepEqual(texts(find(rows, 'foreign profile id', 'ada')[0]).slice(1), ['ada @ tenant-alder', '-', '-', N_A]);
  assert.equal(log.some(({ who, path }) => who === 'ada' && path.startsWith('/v1/profiles/')), false);
});

// The same for a foreign PROFILE id (the other tenant's profile, asked for by this tenant, against a profile that exists nowhere).
test('foreign profile id: other bytes, another status for the control, or an allowed answer are each a bad verdict', async () => {
  const PROFILE_TEXT = 'answered byte for byte like a profile that exists nowhere';
  const bytes = await run(tokens.ada, tokens.bea, { tamper: forge(asks('ada', '/v1/profiles/synthetic-002'), () => refusal('RESOURCE_NOT_FOUND', { note: 'extra' })) });
  assert.deepEqual(texts(find(bytes.rows, 'foreign profile id', 'ada')[0]), ['foreign profile id', 'ada @ tenant-alder', '404', 'refused RESOURCE_NOT_FOUND', PROFILE_TEXT]);
  assert.equal(find(bytes.rows, 'foreign profile id', 'ada')[0][4].className, 'bad');
  const status = await run(tokens.ada, tokens.bea, { tamper: forge(asks('ada', '/v1/profiles/synthetic-999'), (result) => ({ ...result, status: 410 })) });
  assert.equal(find(status.rows, 'foreign profile id', 'ada')[0][4].className, 'bad');
  const leak = await run(tokens.ada, tokens.bea, { tamper: forge(asks('ada', '/v1/profiles/synthetic-002'), () => reply(200, { outcome: 'ok', profile: { id: 'synthetic-002' } })) });
  assert.deepEqual(texts(find(leak.rows, 'foreign profile id', 'ada')[0]).slice(2, 4), ['200', 'allowed']);
  assert.equal(find(leak.rows, 'foreign profile id', 'ada')[0][4].className, 'bad');
});

// A foreign id must be answered byte for byte like an id that exists nowhere.
const FOREIGN = '/v1/projects/proj-0003';
const NOWHERE = '/v1/projects/proj-9999';
const FOREIGN_TEXT = 'answered byte for byte like an id that exists nowhere';
test('foreign project id: a typed refusal with other bytes is not the same answer, and the control row judges the control alone', async () => {
  const { rows } = await run(tokens.bea, tokens.ada, { tamper: forge(asks('bea', FOREIGN), () => refusal('RESOURCE_NOT_FOUND', { note: 'extra' })) });
  assert.deepEqual(texts(find(rows, 'foreign project id', 'bea')[0]), ['foreign project id', 'bea @ tenant-birch', '404', 'refused RESOURCE_NOT_FOUND', FOREIGN_TEXT]);
  assert.equal(find(rows, 'foreign project id', 'bea')[0][4].className, 'bad');
  assert.equal(find(rows, 'control: id that exists nowhere', 'bea')[0][4].className, 'ok');
});
test('foreign project id: the same bytes under another status are not the same answer, and an untyped control is a bad control', async () => {
  const { rows } = await run(tokens.bea, tokens.ada, { tamper: forge(asks('bea', NOWHERE), (result) => ({ ...result, status: 410 })) });
  assert.equal(find(rows, 'foreign project id', 'bea')[0][4].className, 'bad');
  assert.deepEqual(texts(find(rows, 'control: id that exists nowhere', 'bea')[0]).slice(2, 4), ['410', 'untrusted']);
  assert.equal(find(rows, 'control: id that exists nowhere', 'bea')[0][4].className, 'bad');
});
test('foreign project id: a control refused with ANOTHER typed code is a bad control, a control that leaks an object too, and a down network is never "the same answer"', async () => {
  const typed = await run(tokens.bea, tokens.ada, { tamper: forge(asks('bea', NOWHERE), () => refusal('TOKEN_UNKNOWN')) });
  assert.deepEqual(texts(find(typed.rows, 'control: id that exists nowhere', 'bea')[0]).slice(2, 4), [statusOf('TOKEN_UNKNOWN'), 'refused TOKEN_UNKNOWN']);
  assert.equal(find(typed.rows, 'control: id that exists nowhere', 'bea')[0][4].className, 'bad');
  assert.equal(find(typed.rows, 'foreign project id', 'bea')[0][4].className, 'bad');
  const leak = await run(tokens.bea, tokens.ada, { tamper: forge(asks('bea', NOWHERE), () => reply(200, { outcome: 'ok', project: { id: 'proj-9999', name: 'x' } })) });
  assert.deepEqual(texts(find(leak.rows, 'control: id that exists nowhere', 'bea')[0]).slice(2, 4), ['200', 'allowed']);
  assert.equal(find(leak.rows, 'control: id that exists nowhere', 'bea')[0][4].className, 'bad');
  assert.equal(find(leak.rows, 'foreign project id', 'bea')[0][4].className, 'bad');
  const down = await run(tokens.bea, tokens.ada, { tamper: (request) => ([FOREIGN, NOWHERE].includes(request.path) && request.who === 'bea' ? { throws: true } : undefined) });
  assert.deepEqual(texts(find(down.rows, 'foreign project id', 'bea')[0]).slice(2, 4), ['0', 'untrusted']);
  assert.equal(find(down.rows, 'foreign project id', 'bea')[0][4].className, 'bad');
});

// The own project must be readable with an ETag and be the project that was asked for.
const OWN = [
  ['without an ETag', (result) => ({ ...result, etag: null })],
  ['another project', () => reply(200, { outcome: 'ok', project: { id: 'proj-0002', name: 'x' } }, '"e"')],
  ['no project object', () => reply(200, { outcome: 'ok' }, '"e"')],
  ['a typed refusal', () => refusal('RESOURCE_NOT_FOUND')]
];
for (const [name, make] of OWN) {
  test(`own project: ${name} is not "readable, with an ETag"`, async () => {
    const { rows } = await run(tokens.ada, tokens.bea, { tamper: forge(ownRead('ada'), make) });
    const [row] = find(rows, 'own project', 'ada');
    assert.equal(row[4].text, 'readable, with an ETag');
    assert.equal(row[4].className, 'bad');
  });
}

// The claims of the other tenant are refused AS a claim; the search counts only my own matches; the ETag of the other tenant validates nothing.
test('claims, search and ETag: a forged answer is never shown as specified', async () => {
  const claim = await run(tokens.ada, tokens.bea, { tamper: forge((request) => request.who === 'ada' && 'X-Tenant' in request.headers, () => refusal('ROLE_FORBIDDEN')) });
  assert.equal(find(claim.rows, 'tenant claimed in a header', 'ada')[0][4].className, 'bad');
  assert.equal(find(claim.rows, 'tenant claimed in the query', 'ada')[0][4].className, 'ok');
  const query = await run(tokens.ada, tokens.bea, { tamper: forge((request) => request.who === 'ada' && request.path.includes('tenant='), () => reply(200, { outcome: 'ok', items: [], count: 0 })) });
  assert.equal(find(query.rows, 'tenant claimed in the query', 'ada')[0][4].className, 'bad');
  const otherCode = await run(tokens.ada, tokens.bea, { tamper: forge((request) => request.who === 'ada' && ('X-Tenant' in request.headers || request.path.includes('tenant=')), () => refusal('QUERY_INVALID')) });
  assert.equal(find(otherCode.rows, 'tenant claimed in a header', 'ada')[0][4].className, 'bad', 'a 400 with another typed code is not a refused claim');
  const otherQuery = await run(tokens.ada, tokens.bea, { tamper: forge((request) => request.who === 'ada' && request.path.includes('tenant='), () => refusal('QUERY_INVALID')) });
  assert.equal(find(otherQuery.rows, 'tenant claimed in the query', 'ada')[0][4].className, 'bad', 'a 400 with another typed code is not a refused claim');
  const typed = await run(tokens.ada, tokens.bea, { tamper: forge((request) => request.who === 'ada' && request.path.startsWith('/v1/projects?q='), () => refusal('TOKEN_UNKNOWN', { count: 0 })) });
  assert.equal(find(typed.rows, 'search for the other tenant', 'ada')[0][4].className, 'bad', 'a refusal that carries the right count is not an answer');
  const off = await run(tokens.ada, tokens.bea, { tamper: forge((request) => request.who === 'ada' && request.path.startsWith('/v1/projects?q='), () => reply(200, { outcome: 'ok', items: [], count: 1 })) });
  assert.equal(find(off.rows, 'search for the other tenant', 'ada')[0][4].className, 'bad');
});
test('the ETag of the other tenant is sent as "none" when that tenant read no ETag, and a 200 that is not allowed is never specified', async () => {
  const noEtag = await run(tokens.ada, tokens.bea, { tamper: forge((request) => request.who === 'bea' && request.path === '/v1/projects/proj-0001', (result) => ({ ...result, etag: null })) });
  assert.deepEqual(noEtag.log.filter(({ who, headers }) => who === 'ada' && 'If-None-Match' in headers).map(({ headers }) => headers['If-None-Match']), ['"none"']);
  assert.equal(find(noEtag.rows, 'ETag of the other tenant', 'ada')[0][4].className, 'ok');
  const forged = await run(tokens.ada, tokens.bea, { tamper: forge((request) => request.who === 'ada' && 'If-None-Match' in request.headers, () => reply(200, { outcome: 'fine' })) });
  assert.equal(find(forged.rows, 'ETag of the other tenant', 'ada')[0][4].className, 'bad');
});

// The state of the page while a run is in flight, and what a second run does with the rows of the first.
test('during a run the button is disabled and the status says so; a second run replaces the rows and enables the button again', async () => {
  const document = createDocument();
  const seen = [];
  const { fetch } = bridge({ document, observe: (path, doc) => seen.push([path, doc.getElementById('run').disabled, doc.getElementById('status').textContent]) });
  loadPage({ fetch, document });
  await click(document, tokens.ada, tokens.bea);
  const first = rowsOf(document).length;
  assert.equal(first, 19);
  assert.ok(seen.length > 0 && seen.every(([, disabled, status]) => disabled === true && status === 'Running the probes...'), 'every request is made while the page says it runs');
  assert.equal(document.getElementById('run').disabled, false);
  await click(document, tokens.bea, tokens.ada);
  assert.equal(rowsOf(document).length, 19, 'the rows of the first run are gone');
  assert.equal(document.getElementById('status').textContent, 'Isolation holds between tenant-birch and tenant-alder: 19 of 19 checks as specified.');
});
