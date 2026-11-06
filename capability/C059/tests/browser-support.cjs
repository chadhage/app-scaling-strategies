'use strict';

// Test tooling, not production code: a real isolated headless Edge observation of the C059 journey. The helper allows only GET and
// aborts every other method, so the browser cannot POST: the page then reports UNKNOWN (no valid answer) and offers Retry and
// Inspect; steps prepared from Node (committed, in flight, cancelled, interrupted) are reached through the GET Inspect control. The
// accessibility tree (ariaSnapshot), a recorded Tab traversal, the focus indicator, the live region (one MutationObserver record per
// announcement), reduced motion and reflow at 320 px are observed on the REAL DOM. Prints PASS lines and one JSON summary; writes no file.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createMemoryIo } = require('../../C042/journal.cjs');
const { call } = require('./net.cjs');
const { closeServer, startLocal } = require('../server.cjs');
const { produceTranscript } = require('../transcript.cjs');

const repository = path.resolve(__dirname, '..', '..', '..');
const { openIsolatedLoopback } = require(path.join(repository, 'testing', 'browser', 'isolated.cjs'));
const { qualifyEdge } = require(path.join(repository, 'testing', 'browser', 'qualify', 'qualify.cjs'));
const checks = [];
const checked = (name, observed) => { checks.push({ name, observed }); console.log(`PASS ${name}`); };
const body = (key, over = {}) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: key, leaseId: 'synthetic-lease-001', units: 5, ...over });
const K = { done: 'edge-key-0001', flight: 'edge-key-0002', cancelled: 'edge-key-0003', interrupted: 'edge-key-0004', unknown: 'edge-key-0099' };
const INITIAL_ORDER = ['skip-link', 'nav-choose', 'nav-conduct', 'nav-result', 'lesson-A-S001', 'open-lesson', 'close-lesson', 'key', 'lease', 'units', 'submit', 'start-over'];

// Prepares the service state from Node: a committed step, a step held in flight, a cancelled step and an interrupted one (a restart).
async function prepare() {
  const io = createMemoryIo();
  let release;
  let releaseCancelled;
  const first = await startLocal({ io, executor: ({ key }) => (key === K.interrupted ? new Promise(() => {}) : undefined) });
  const stuck = call(first.address().port, 'POST', '/v1/steps', body(K.interrupted, { units: 3 })).catch(() => {});
  for (let turn = 0; turn < 20000 && first.engine.inspect(K.interrupted).body.step.state !== 'in-flight'; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  await closeServer(first);
  await stuck;
  const gate = new Promise((resolve) => { release = resolve; });
  const gateCancelled = new Promise((resolve) => { releaseCancelled = resolve; });
  const server = await startLocal({ io, transcript: produceTranscript, executor: ({ key }) => (key === K.flight ? gate : key === K.cancelled ? gateCancelled : undefined) });
  const port = server.address().port;
  assert.equal((await call(port, 'POST', '/v1/steps', body(K.done))).status, 201);
  const pending = call(port, 'POST', '/v1/steps', body(K.flight, { units: 2 })).catch(() => {});
  const doomed = call(port, 'POST', '/v1/steps', body(K.cancelled, { units: 1 })).catch(() => {});
  for (let turn = 0; turn < 20000 && server.engine.inspect(K.cancelled).body.step.state !== 'in-flight'; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await call(port, 'POST', `/v1/steps/${K.cancelled}/cancel`)).json.outcome, 'cancelled');
  releaseCancelled();
  await doomed;
  return { server, port, release, pending };
}

module.exports = { INITIAL_ORDER, K, checked, checks, openIsolatedLoopback, prepare, qualifyEdge, repository, body };
