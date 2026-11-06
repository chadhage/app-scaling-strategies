'use strict';

// Self-review line 9, the injected-failure cleanup proof: the two real-browser scripts close their session and shut their servers down in a `finally`.
// Here an INJECTED failing assertion and a FAKE session (no browser, no Edge) prove that the functions real runs use really do clean up when the
// page assertion, the setup or the observation fails, and that the failure itself is not swallowed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { scenario } = require('./browser.cjs');
const journal = require('./browser-journal.cjs');

function fakeOpen(page) {
  const state = { opened: 0, closed: 0 };
  const open = async () => {
    state.opened += 1;
    return { browserVersion: '156.0.0.0', page, close: async () => { state.closed += 1; } };
  };
  return { state, open };
}

test('a scenario whose assertion fails still closes the browser session once and shuts its server down; the failure is not swallowed', async () => {
  const { state, open } = fakeOpen({});
  let server = null;
  const options = { setup: async (env) => { server = env.server; } };
  await assert.rejects(scenario('injected failure', options, async () => { throw new Error('injected failure: the page assertion failed'); }, [], {}, open), /injected failure: the page assertion failed/);
  assert.equal(state.opened, 1, 'a session was opened');
  assert.equal(state.closed, 1, 'the session was closed exactly once');
  assert.equal(server.listening, false, 'the server of the scenario was shut down');
});

test('a scenario that fails in its setup, before any session exists, closes nothing and still shuts its server down', async () => {
  const { state, open } = fakeOpen({});
  let server = null;
  const options = { setup: async (env) => { server = env.server; throw new Error('injected failure: the setup failed'); } };
  await assert.rejects(scenario('injected setup failure', options, async () => {}, [], {}, open), /injected failure: the setup failed/);
  assert.equal(state.opened, 0, 'no session was opened');
  assert.equal(state.closed, 0);
  assert.equal(server.listening, false, 'the server of the scenario was shut down');
});

test('a scenario that succeeds closes its session too, and records what the page showed', async () => {
  const page = { evaluate: async () => ({ ids: ['a', 'b'], journal: [], steps: [], status: '', lease: '', units: '', outcome: '', facts: [], disabled: {}, active: null }) };
  const { state, open } = fakeOpen(page);
  const record = [];
  await scenario('quiet', { setup: async () => {} }, async () => {}, record, {}, open);
  assert.equal(state.closed, 1);
  assert.equal(record.length, 1);
});

test('the journal observation closes its session when the page fails and rejects with that failure', async () => {
  const page = { click: async () => { throw new Error('injected failure: the page failed'); } };
  const { state, open } = fakeOpen(page);
  await assert.rejects(journal.main({ open }), /injected failure: the page failed/);
  assert.equal(state.opened, 1);
  assert.equal(state.closed, 1, 'the session was closed exactly once');
});
