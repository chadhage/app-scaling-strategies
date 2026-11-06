'use strict';

// RED snapshot of the initial specification tests (C014.feature, part 1). Immutable after it is archived: the replay against the final files runs
// these exact bytes. They use only the public surface: startLocal() of the subject's server.cjs, service.plant(), service.issueToken() and HTTP.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { WHO, seedConfig, canaryList, clientCanaries } = require('./canaries.snapshot.cjs');
const { ENCODERS, scan, createStreamScanner } = require('./scanner.snapshot.cjs');
const { loadSubject, build, exchange, parseAnswers, call, Transcript } = require('./harness.snapshot.cjs');

const PLACES = ['run', 'trace', 'log', 'audit', 'error'];
const CODE = (value) => value === null || /^[A-Z_]+$/.test(value) || value === 'ok';
// The independent oracle of what public evidence may contain: EXACTLY these keys, each in its closed vocabulary or shape.
const ONE_OF = (...values) => (value) => values.includes(value);
const INT = (value) => Number.isSafeInteger(value) && value >= 0;
const STEPS = (value) => Array.isArray(value) && value.length <= 8 && value.every((step) => Object.keys(step).sort().join() === 'detail,event'
  && ONE_OF('dispatch', 'connect', 'response', 'failure', 'note')(step.event) && typeof step.detail === 'string');
const SHAPES = {
  trace: { seq: INT, kind: ONE_OF('request', 'upstream', 'store', 'error'), method: ONE_OF('GET', 'POST', 'OTHER'), route: ONE_OF('asset', 'scope', 'evidence', 'manage', 'command', 'unknown'),
    status: INT, role: ONE_OF('visitor', 'conductor', 'operator', null), code: CODE, steps: STEPS },
  runs: { id: (value) => /^run-\d{4,}$/.test(value), units: INT, owner: ONE_OF(...WHO, null), revision: INT, status: ONE_OF('ok', 'failed'), artifacts: INT, steps: STEPS },
  audit: { seq: INT, outcome: ONE_OF('applied', 'denied', 'rejected', 'unauthenticated', 'failed'), code: CODE, command: ONE_OF('run.create', 'config.check', null),
    subject: ONE_OF(...WHO, null), role: ONE_OF('visitor', 'conductor', 'operator', null) },
  logs: { seq: INT, level: ONE_OF('info', 'warn', 'error'), event: ONE_OF('request', 'command', 'upstream', 'store', 'startup'), route: ONE_OF('asset', 'scope', 'evidence', 'manage', 'command', 'unknown'),
    status: INT, code: CODE, role: ONE_OF('visitor', 'conductor', 'operator', null) }
};

function assertShape(kind, item) {
  assert.deepEqual(Object.keys(item).sort(), Object.keys(SHAPES[kind]).sort(), `${kind}: the public item has exactly the allowed fields`);
  for (const [field, ok] of Object.entries(SHAPES[kind])) assert.equal(ok(item[field]), true, `${kind}.${field} is outside its closed vocabulary or shape`);
}

async function withService(body) {
  const config = seedConfig();
  const consoleLines = [];
  const { startLocal } = loadSubject();
  const local = await startLocal({ config, logSink: (line) => consoleLines.push(String(line)) });
  try { return await body({ local, config, consoleLines }); } finally { await local.close(); }
}

const ROUTES = ['/', '/page.js', '/style.css', '/scope.json', '/v1/evidence/trace?limit=200', '/v1/evidence/runs?limit=200', '/v1/evidence/audit?limit=200', '/v1/evidence/logs?limit=200',
  '/v1/evidence/bundle', '/v1/manage/config', '/v1/nowhere', '/v1/evidence/trace?limit=zero'];

test('the canary sweep: no canary in any covered encoding in any byte that left the server (every route, every identity, every planting place)', { timeout: 120000 }, () => withService(async ({ local, config, consoleLines }) => {
  const expired = local.service.issueToken('operator', { ttlMs: 0 });
  const held = [...canaryList(config), { id: 'token-expired', value: expired }];
  const client = clientCanaries();
  const everything = [...held, ...client];
  const transcript = new Transcript();
  const port = local.port;
  const get = async (label, target, options) => { const result = await call(port, 'GET', target, options); transcript.add(`${label} GET ${target}`, result.bytes); return result; };
  const post = async (label, target, options) => { const result = await call(port, 'POST', target, options); transcript.add(`${label} POST ${target}`, result.bytes); return result; };

  // 1. plant every held canary, in every encoding, in every place the system can touch
  for (const place of PLACES) for (const canary of held) local.service.plant(place, Object.values(ENCODERS).map((encode) => encode(canary.value)).join(' '));

  // 2. real management traffic: the service uses its secrets (upstream credential, store connection, contacts) and fails with them in an exception
  const ok = await post('conductor-a', '/v1/commands/run.create', { token: config.tokens['conductor-a'], body: { name: 'sweep-run', units: 3 } });
  assert.equal(ok.status, 200);
  assert.equal((await post('visitor', '/v1/commands/run.create', { token: config.tokens.visitor, body: { name: 'sweep-run', units: 1 } })).status, 403);
  assert.equal((await post('operator', '/v1/commands/config.check', { token: config.tokens.operator, body: { mode: 'ok' } })).status, 200);
  const failed = await post('operator', '/v1/commands/config.check', { token: config.tokens.operator, body: { mode: 'fail' } });
  assert.equal(failed.status, 500, 'a failing management command is a typed 500 with a fixed message');
  assert.equal(failed.json().error.code, 'COMMAND_FAILED');

  // 3. canaries a client plants in its own requests: headers, cookie, URL, query and body (the server never held them)
  const [cHeader, cUrl, cQuery, cBody, cCookie, cAgent] = client.map((canary) => canary.value);
  const noisy = { 'User-Agent': cAgent, Referer: `http://127.0.0.1/${cUrl}`, Cookie: `sid=${cCookie}`, 'X-Role': cHeader, 'X-Forwarded-For': cHeader, 'X-Request-Id': cHeader };
  await post('noisy', '/v1/commands/run.create', { token: config.tokens['conductor-b'], headers: noisy, body: { name: cBody.toLowerCase().slice(0, 30), units: 2 } });
  await post('noisy', '/v1/commands/run.create', { token: config.tokens['conductor-b'], headers: noisy, body: { name: 'x', units: 2, [cBody]: cBody } });
  await post('noisy', `/v1/commands/${cUrl}`, { token: config.tokens.operator, headers: noisy, body: { note: cBody } });
  await post('noisy', '/v1/commands/run.create', { token: config.tokens['conductor-a'], headers: noisy, body: `{"name":"${cBody}` });
  await get('noisy', `/v1/evidence/runs?limit=${cQuery}`, { headers: noisy });
  await get('noisy', `/${cUrl}`, { headers: noisy, token: cHeader });

  // 4. every route as every identity
  const identities = [['anonymous', null], ...WHO.map((who) => [who, config.tokens[who]]), ['forged', `c009_${'A'.repeat(43)}`], ['malformed', 'not-a-token'], ['expired', expired]];
  for (const [label, token] of identities) {
    for (const route of ROUTES) await get(label, route, { token, headers: noisy });
    await post(label, '/v1/commands/run.create', { token, headers: noisy, body: { name: 'sweep-again', units: 1 } });
    await post(label, '/v1/commands/config.check', { token, body: { mode: 'fail' } });
  }

  // 5. scan every byte: the whole transcript at once, the same bytes in one-byte chunks, and what the process printed
  const bytes = transcript.all();
  assert.ok(transcript.size() > 20000, 'the sweep collected real answers');
  assert.deepEqual(scan(bytes, everything), [], 'no canary in any covered encoding in any answer');
  const stream = createStreamScanner(everything);
  for (let at = 0; at < bytes.length; at += 1) stream.push(bytes.subarray(at, at + 1));
  assert.deepEqual(stream.hits(), [], 'no canary when the answers are read one byte at a time');
  assert.deepEqual(scan(consoleLines.join('\n'), everything), [], 'no canary in the console and log output');

  // 6. non-vacuous: the planted records ARE served, as allow-listed items; and the answers use the allowed vocabulary only
  for (const kind of ['trace', 'runs', 'audit', 'logs']) {
    const answer = (await call(port, 'GET', `/v1/evidence/${kind}?limit=200`)).json();
    assert.equal(answer.outcome, 'ok');
    assert.equal(answer.kind, kind);
    assert.ok(answer.total >= 1 && answer.shown >= 1 && answer.shown <= answer.total, `${kind}: shown ${answer.shown} of ${answer.total}`);
    assert.equal(answer.items.length, answer.shown);
    for (const item of answer.items) assertShape(kind, item);
  }
}));

test('secrets are used only on the server: the bundle signature is an HMAC of the public bundle bytes with the signing key, and the key is nowhere', () => withService(async ({ local, config }) => {
  await call(local.port, 'POST', '/v1/commands/run.create', { token: config.tokens['conductor-a'], body: { name: 'signed-run', units: 5 } });
  const answer = (await call(local.port, 'GET', '/v1/evidence/bundle')).answer;
  assert.match(answer.headers['content-disposition'], /^attachment; filename="c014-evidence-bundle\.json"$/);
  const bundle = JSON.parse(answer.body.toString('utf8'));
  const { signature, ...unsigned } = bundle;
  assert.equal(signature.alg, 'HMAC-SHA256');
  assert.match(signature.value, /^[0-9a-f]{64}$/);
  assert.equal(signature.value, createHmac('sha256', config.signingKey).update(JSON.stringify(unsigned)).digest('hex'), 'signed server-side with the signing key');
  assert.equal(bundle.schema, 'c014-evidence/1');
  assert.equal(bundle.counts.runs, bundle.runs.length);
  assert.equal(scan(answer.body, canaryList(config)).length, 0);
  for (const kind of ['trace', 'runs', 'audit', 'logs']) for (const item of bundle[kind]) assertShape(kind, item);
}));

test('the management route answers only the operator and never prints a secret: booleans and counts only', () => withService(async ({ local, config }) => {
  assert.equal((await call(local.port, 'GET', '/v1/manage/config')).status, 401);
  assert.equal((await call(local.port, 'GET', '/v1/manage/config', { token: config.tokens.visitor })).status, 403);
  assert.equal((await call(local.port, 'GET', '/v1/manage/config', { token: config.tokens['conductor-a'] })).status, 403);
  for (const headers of [{}, { Authorization: `Bearer ${config.tokens.visitor}` }]) {
    const kept = await exchange(local.port, build('GET', '/v1/manage/config', { port: local.port, headers }), { settleMs: 3000 });
    assert.equal(parseAnswers(kept.bytes)[0].headers.connection, 'close', 'a refusal on a keep-alive connection announces Connection: close');
    assert.equal(kept.closed, true, 'and the server ends that connection');
  }
  const answer = await call(local.port, 'GET', '/v1/manage/config', { token: config.tokens.operator });
  assert.equal(answer.status, 200);
  assert.equal(answer.answer.headers['cache-control'], 'no-store');
  assert.deepEqual(answer.json(), { outcome: 'ok', configured: { tokens: 4, signingKey: true, connectionString: true, serviceCredential: true, contacts: 4 } });
}));
