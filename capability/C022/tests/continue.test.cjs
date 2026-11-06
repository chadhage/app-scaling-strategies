'use strict';

// Expect: 100-continue (found by the systematic mutants: removing the single call that sends the interim answer survived the whole suite).
// A request that passed authentication, the role table and the media-type check is invited to send its body with a 100 Continue and then
// answered; a request that is REFUSED first is never invited (no 100: the client keeps its body).
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { raw, startApp } = require('./helpers.cjs');

let ctx;
let alf;
let ana;
before(async () => {
  ctx = await startApp();
  alf = (await ctx.session('alf')).token;
  ana = (await ctx.session('ana')).token;
});
after(async () => { await ctx.close(); });

const post = (extra, token = alf, body = { name: 'continue', units: 1 }) => raw.request(ctx.port, 'POST', '/v1/projects', { headers: [...(token ? [`Authorization: Bearer ${token}`] : []), 'Content-Type: application/json', ...extra], body: JSON.stringify(body) });

test('a valid mutation with Expect: 100-continue is invited with 100 Continue and then answered 201, once', async () => {
  const result = await raw.exchange(ctx.port, post(['Expect: 100-continue']), { waitMs: 6000, settleMs: 250 });
  assert.deepEqual(result.answers.map((answer) => answer.status), [100, 201]);
  assert.equal(result.answers[1].json.project.name, 'continue');
  const listed = await ctx.call('GET', '/v1/projects?q=continue', { token: alf });
  assert.equal(listed.json.count, 1, 'the mutation applied exactly once');
});

test('a request that is refused first is never invited: 401 without a credential, 403 for a viewer, 415 for the wrong media type, each without a 100', async () => {
  const cases = [
    [post(['Expect: 100-continue'], null), 401],
    [post(['Expect: 100-continue'], ana), 403],
    [raw.request(ctx.port, 'POST', '/v1/projects', { headers: [`Authorization: Bearer ${alf}`, 'Content-Type: text/plain', 'Expect: 100-continue'], body: '{}' }), 415]
  ];
  for (const [bytes, status] of cases) {
    const result = await raw.exchange(ctx.port, bytes, { waitMs: 6000, settleMs: 250 });
    assert.deepEqual(result.answers.map((answer) => answer.status), [status]);
    assert.equal(result.closedByServer, true);
  }
});

test('Expect: 100-continue changes nothing for a refusal decided after the invitation: the body is refused with its typed code and the connection ends', async () => {
  const result = await raw.exchange(ctx.port, post(['Expect: 100-continue'], alf, { name: 'x', units: 1, owner: 'ada' }), { waitMs: 6000, settleMs: 250 });
  assert.deepEqual(result.answers.map((answer) => answer.status), [100, 400]);
  assert.equal(result.answers[1].json.outcome, 'INPUT_UNKNOWN_FIELD');
  assert.equal(result.closedByServer, true);
});
