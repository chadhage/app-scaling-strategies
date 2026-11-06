'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { withApp } = require('./helpers.cjs');
const { exchange, bare } = require('./raw-http.cjs');
const { auth, post, JSON_HEADERS } = require('./refusal-rows.cjs');

// Pre-publication checklist item 14 (the upgrade path). The server registers no 'upgrade' listener, and Node then treats a request that
// asks for an upgrade as an ordinary request: it reaches the same handler, the same lanes and the same refusal path. This pins both
// halves, so a later 'upgrade' listener that takes a socket away from the refusal path has to bring its own tests (http-io.cjs rule 4).
const UPGRADE = ['Connection: Upgrade', 'Upgrade: websocket'];
const LONG = { settleMs: 2500, waitMs: 15000 };
const tokensOf = (context) => Object.fromEntries(['visitor', 'operator'].map((name) => [name, context.app.issueToken(name)]));

test('a request that asks for an upgrade is an ordinary request: served, or refused and then final like any other refusal', () => withApp({}, async (context) => {
  assert.equal(context.app.server.listenerCount('upgrade'), 0, 'no upgrade listener: nothing can take a socket away from the refusal path');
  const tokens = tokensOf(context);
  const served = await exchange(context.port, bare(context.port, 'GET', '/v1/state', UPGRADE), LONG);
  assert.deepEqual(served.answers.map((answer) => answer.status), [200]);
  const refusal = post(context.port, 'run.create', [auth(tokens.visitor), ...JSON_HEADERS, ...UPGRADE], '{"name":"a","units":1}');
  const mutation = post(context.port, 'pool.resize', [auth(tokens.operator), ...JSON_HEADERS], '{"size":7}');
  const behind = await exchange(context.port, Buffer.concat([refusal, mutation]), LONG);
  assert.deepEqual(behind.answers.map((answer) => answer.status), [403], 'the refusal is answered and nothing behind it is');
  assert.equal(behind.closedByServer, true);
  assert.deepEqual([context.app.snapshot().revision, context.app.snapshot().state.pool.size], [0, 2], 'the mutation behind the refusal did not run');
  const later = await exchange(context.port, Buffer.concat([bare(context.port, 'GET', '/v1/state'), refusal, mutation]), LONG);
  assert.deepEqual(later.answers.map((answer) => answer.status), [200, 403], 'a refusal that asked for an upgrade behind a GET is answered, nothing behind it is');
  assert.equal(later.closedByServer, true);
  assert.deepEqual([context.app.snapshot().revision, context.app.snapshot().state.pool.size], [0, 2], 'no mutation ran in any of the shapes');
}));
