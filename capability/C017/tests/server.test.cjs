'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const h = require('./http.cjs');

const base = (kind, key = 'http-key-0001', extra = {}) => ({ schemaVersion: 1, kind, key, ...s.attribution, ...extra });
const cancelBody = (actionId, key, extra = {}) => ({ ...base('cancel', key), actionId, epoch: 1, compensate: false, ...extra });

async function startOver(t, hold) {
  const env = await h.serve(t);
  if (hold) env.ctx.g.hold(hold[0], hold[1]);
  const started = await h.post(env.origin, '/api/start', { ...base('start'), expectedEpoch: 0 });
  assert.equal(started.status, 202);
  env.actionId = started.json.action.actionId;
  if (hold) await env.ctx.g.reached(hold[0], hold[1]);
  return env;
}

test('routes: state, scope and assets carry strict headers; unknown routes and methods are typed failures', async (t) => {
  const { origin } = await h.serve(t);
  const state = await h.get(origin, '/api/state');
  assert.equal(state.status, 200);
  assert.equal(state.json.kind, 'C017-state');
  assert.equal(state.json.action, null);
  assert.match(state.headers['content-security-policy'], /default-src 'none'; script-src 'self'/);
  assert.equal(state.headers['cache-control'], 'no-store');
  assert.equal(state.headers['x-content-type-options'], 'nosniff');
  const scope = await h.get(origin, '/scope.json');
  assert.deepEqual([scope.json.liveAzureRuns, scope.json.authorizedCloudSpend, scope.json.productionRuntimeValidated, scope.json.powerLossGuarantee], [0, 0, false, false]);
  for (const [path, type] of [['/', 'text/html'], ['/contract.js', 'text/javascript'], ['/page.js', 'text/javascript'], ['/style.css', 'text/css']]) {
    const asset = await h.get(origin, path);
    assert.equal(asset.status, 200, path);
    assert.match(asset.headers['content-type'], new RegExp(type));
  }
  assert.equal((await h.get(origin, '/nope')).json.error.code, 'NOT_FOUND');
  assert.equal((await h.get(origin, '/api/state?x=1')).json.error.code, 'NOT_FOUND');
  assert.equal((await h.request(origin, { method: 'PUT', path: '/api/cancel', headers: h.jsonHeaders, body: '{}' })).json.error.code, 'METHOD_NOT_ALLOWED');
  assert.equal((await h.post(origin, '/api/state', {})).json.error.code, 'METHOD_NOT_ALLOWED');
  assert.equal((await h.request(origin, { method: 'GET', path: '/api/cancel' })).status, 405);
});

test('a cancel over HTTP is answered with the journal-derived outcome and a status that is never success for too late or unknown', async (t) => {
  const env = await startOver(t, ['before', 3]);
  const pending = h.post(env.origin, '/api/cancel', cancelBody(env.actionId, 'http-key-0002'));
  const answer = await pending;
  assert.equal(answer.status, 200);
  assert.equal(answer.json.outcome, 'CANCELLED_PARTIAL');
  assert.deepEqual(answer.json.facts.effectsStanding.map((e) => e.step), [1, 2]);
  s.assertHonest(assert, answer.json, env.ctx.engine.view().journal);
  const state = (await h.get(env.origin, '/api/state')).json;
  assert.equal(state.action.status, 'CANCELLED');
  assert.equal(state.journal.at(-1).type, 'cancel-decided');
  const late = await h.post(env.origin, '/api/cancel', cancelBody(env.actionId, 'http-key-0003'));
  assert.equal(late.status, 409);
  assert.equal(late.json.error.code, 'ALREADY_TERMINAL');
  const replay = await h.post(env.origin, '/api/cancel', cancelBody(env.actionId, 'http-key-0002'));
  assert.equal(replay.status, 200);
  assert.equal(replay.json.idempotentReplay, true);
  assert.equal(replay.json.outcome, 'CANCELLED_PARTIAL');
});

test('a cancel after completion is HTTP 409 CANCEL_TOO_LATE', async (t) => {
  const env = await startOver(t);
  await s.wait(env.ctx, (state) => state.action.status === 'COMPLETED');
  const late = await h.post(env.origin, '/api/cancel', cancelBody(env.actionId, 'http-key-0002'));
  assert.equal(late.status, 409);
  assert.equal(late.json.outcome, 'CANCEL_TOO_LATE');
  assert.equal(late.json.effective, false);
});

const hostile = [
  ['forged outcome field', (id) => JSON.stringify(cancelBody(id, 'hostile-0001', { outcome: 'COMPENSATED' })), 400, 'INVALID_COMMAND'],
  ['forged facts', (id) => JSON.stringify(cancelBody(id, 'hostile-0002', { undone: [{ step: 1, units: 5 }], effectsStanding: [] })), 400, 'INVALID_COMMAND'],
  ['proto key', (id) => JSON.stringify(cancelBody(id, 'hostile-0003')).replace('{', '{"__proto__":{"polluted":true},'), 400, 'INVALID_COMMAND'],
  ['constructor key', (id) => JSON.stringify(cancelBody(id, 'hostile-0004', { constructor: { prototype: { polluted: true } } })), 400, 'INVALID_COMMAND'],
  ['duplicate keys', (id) => JSON.stringify(cancelBody(id, 'hostile-0005')).replace('"epoch":1', '"epoch":1,"epoch":2'), 400, 'INVALID_JSON'],
  ['fraction', (id) => JSON.stringify(cancelBody(id, 'hostile-0006')).replace('"epoch":1', '"epoch":1.5'), 400, 'INVALID_JSON'],
  ['negative zero', (id) => JSON.stringify(cancelBody(id, 'hostile-0007')).replace('"epoch":1', '"epoch":-0'), 400, 'INVALID_JSON'],
  ['string boolean', (id) => JSON.stringify(cancelBody(id, 'hostile-0008', { compensate: 'true' })), 400, 'INVALID_COMMAND'],
  ['array body', () => '[]', 400, 'INVALID_COMMAND'],
  ['number body', () => '7', 400, 'INVALID_COMMAND'],
  ['empty body', () => '', 400, 'INVALID_JSON'],
  ['truncated json', () => '{"schemaVersion":1,', 400, 'INVALID_JSON'],
  ['deep nesting', () => `${'['.repeat(20)}1${']'.repeat(20)}`, 400, 'INVALID_JSON'],
  ['kind mismatch', (id) => JSON.stringify({ ...base('start', 'hostile-0009'), expectedEpoch: 0, actionId: id }), 400, 'INVALID_COMMAND'],
  ['evil identifier', (id) => JSON.stringify(cancelBody('<script>alert(1)</script>', 'hostile-0010')), 400, 'INVALID_COMMAND'],
  ['short key', (id) => JSON.stringify(cancelBody(id, 'k')), 400, 'INVALID_COMMAND'],
];

for (const [name, build, status, code] of hostile) {
  test(`hostile request is refused before any effect: ${name}`, async (t) => {
    const env = await startOver(t, ['before', 2]);
    const size = env.ctx.engine.view().journal.length;
    const answer = await h.post(env.origin, '/api/cancel', build(env.actionId));
    assert.equal(answer.status, status);
    assert.equal(answer.json.error.code, code);
    assert.equal(answer.json.outcome, undefined);
    assert.equal(answer.json.effectClaimed, false);
    assert.doesNotMatch(answer.text, /<script>/);
    assert.equal(env.ctx.engine.view().journal.length, size, 'the journal is unchanged');
    assert.equal({}.polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
  });
}

test('transport hostility: wrong media type, huge or chunked bodies, foreign origin, forged host and cross-site fetches', async (t) => {
  const env = await startOver(t, ['before', 2]);
  const size = env.ctx.engine.view().journal.length;
  const body = JSON.stringify(cancelBody(env.actionId, 'hostile-1001'));
  const asText = await h.request(env.origin, { method: 'POST', path: '/api/cancel', headers: { 'Content-Type': 'text/plain' }, body });
  assert.equal(asText.json.error.code, 'UNSUPPORTED_MEDIA_TYPE');
  assert.equal((await h.request(env.origin, { method: 'POST', path: '/api/cancel', body })).status, 415);
  const huge = await h.request(env.origin, { method: 'POST', path: '/api/cancel', headers: h.jsonHeaders, body: 'x'.repeat(100000) });
  assert.equal(huge.status, 413);
  assert.equal(huge.json.error.code, 'BODY_TOO_LARGE');
  assert.equal(huge.headers.connection, 'close');
  const streamed = await h.request(env.origin, { method: 'POST', path: '/api/cancel', headers: { ...h.jsonHeaders, 'Transfer-Encoding': 'chunked' }, body: 'y'.repeat(20000), chunked: true });
  assert.equal(streamed.status, 413);
  const lying = await h.request(env.origin, { method: 'POST', path: '/api/cancel', headers: { ...h.jsonHeaders, 'Content-Length': '12abc' }, body: '{}' }).catch(() => ({ status: 400 }));
  assert.ok([400, 413].includes(lying.status));
  assert.equal((await h.post(env.origin, '/api/cancel', body, { Origin: 'http://evil.example' })).json.error.code, 'FORBIDDEN_ORIGIN');
  assert.equal((await h.post(env.origin, '/api/cancel', body, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await h.post(env.origin, '/api/cancel', body, { Host: 'evil.example' })).status, 403);
  assert.equal(env.ctx.engine.view().journal.length, size, 'no hostile transport request changed the journal');
});

test('parallel HTTP clients racing the final step get exactly one consistent outcome', async (t) => {
  const env = await startOver(t, ['in', 4]);
  const calls = Array.from({ length: 8 }, (_, i) => h.post(env.origin, '/api/cancel', cancelBody(env.actionId, `storm-http-${String(i).padStart(4, '0')}`)));
  await s.wait(env.ctx, (state) => Boolean(state.action.cancel));
  env.ctx.g.release('in', 4);
  const answers = await Promise.all(calls);
  const wins = answers.filter((a) => a.json.kind === 'C017-cancel-result');
  assert.equal(wins.length, 1);
  assert.equal(wins[0].status, 409);
  assert.equal(wins[0].json.outcome, 'CANCEL_TOO_LATE');
  assert.ok(answers.filter((a) => a !== wins[0]).every((a) => ['CANCEL_IN_PROGRESS', 'ALREADY_TERMINAL'].includes(a.json.error.code)));
  assert.equal(s.decisions(env.ctx).length, 1);
  s.assertHonest(assert, wins[0].json, env.ctx.engine.view().journal);
});
