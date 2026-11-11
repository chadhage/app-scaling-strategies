'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDocument, runPage } = require('./dom-stub.cjs');
const { answer } = require('./u069-probes.cjs');
const identities = ['visitor','conductor-a','conductor-b','operator'];
async function inspect(rewrite) {
  const document = createDocument();
  await runPage({ document, fetch: async (route, options = {}) => {
    const token = (options.headers?.Authorization || '').slice(7);
    const who = identities.includes(token) ? token : 'anonymous';
    const response = structuredClone(answer(who, route));
    rewrite?.(response, who, route);
    return { status: response.status, text: async () => JSON.stringify(response.body) };
  } });
  for (const who of identities) document.getElementById('token-'+who).value = who;
  await assert.doesNotReject(() => document.getElementById('run').click());
  return { status: document.getElementById('status').textContent, rows: document.getElementById('rows').children };
}
test('U068 replay count cannot be below the visible history count', async () => {
  const view = await inspect((response, who, route) => {
    if (route === '/v1/allowance') {
      response.body.allowance.lease.replayKeys = 0;
      response.body.allowance.lease.remainingReplayKeys = 1000;
    }
  });
  assert.equal(view.rows.length, 0, 'contradictory replay identity facts are not shown as allowed');
  assert.match(view.status, /^Nothing to inspect:/);
});
test('U068 visible history identities must be unique before replay arithmetic is announced', async () => {
  const view = await inspect((response, who, route) => {
    if (route.startsWith('/v1/reservations?')) {
      response.body.items.push({ ...response.body.items[0] });
      response.body.total = 2;
    }
    if (route === '/v1/allowance') {
      response.body.allowance.lease.replayKeys = 2;
      response.body.allowance.lease.remainingReplayKeys = 998;
    }
  });
  assert.equal(view.rows.length, 0);
  assert.match(view.status, /^Nothing to inspect:/);
});
test('U068 replay allowance boundaries reject every inconsistent or unbounded counter', async () => {
  for (const value of [null,-1,0,0.5,'1',2001]) {
    const view = await inspect((response, who, route) => {
      if (route === '/v1/allowance') response.body.allowance.lease.maxReplayKeys = value;
    });
    assert.equal(view.rows.length, 0, JSON.stringify(value));
    assert.match(view.status, /^Nothing to inspect:/);
  }
});
test('U068 announced replay facts are derived from validated own arithmetic', async () => {
  const view = await inspect();
  assert.equal(view.rows.length, 21);
  assert.match(view.status, /Replay keys: conductor-a 1\/1000 \(999 remaining\); conductor-b 1\/1000 \(999 remaining\)\.$/);
});
