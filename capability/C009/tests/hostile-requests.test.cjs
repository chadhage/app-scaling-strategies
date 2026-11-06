'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { withApp, request, rawRequest, VALID, send } = require('./helpers.cjs');

const IDENTITIES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const json = { 'Content-Type': 'application/json' };

test('method override headers and query switches are never honoured', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  const visitor = context.app.issueToken('visitor');
  const auth = (token) => ({ Authorization: `Bearer ${token}`, ...json });
  for (const header of ['X-HTTP-Method-Override', 'X-Method-Override', 'X-HTTP-Method', 'X-Original-Method']) {
    for (const value of ['POST', 'PUT', 'DELETE']) {
      const get = await request(context, { method: 'GET', route: '/v1/commands/pool.resize', headers: { ...auth(operator), [header]: value } });
      assert.equal(get.status, 405, `${header}: ${value}`);
      assert.equal(get.headers.allow, 'POST');
    }
    assert.equal((await send(context, 'pool.resize', operator, { size: 7 }, { [header]: 'GET' })).status, 200, header);
  }
  const readPost = await request(context, { method: 'POST', route: '/v1/state', headers: { ...auth(operator), 'X-HTTP-Method-Override': 'GET' }, body: '{}' });
  assert.equal(readPost.status, 405);
  const before = context.app.snapshot();
  for (const query of ['_method=PUT', 'method=DELETE', 'action=pool.resize']) {
    const route = `/v1/commands/pool.resize?${query}`;
    assert.equal((await request(context, { method: 'POST', route, headers: auth(visitor), body: '{"size":9}' })).status, 403, query);
    const rejected = await request(context, { method: 'POST', route, headers: auth(operator), body: '{"size":9}' });
    assert.deepEqual([rejected.status, rejected.json.error.code], [400, 'QUERY_NOT_ALLOWED'], query);
  }
  assert.deepEqual(context.app.snapshot(), before);
}));

const NAMES = [
  ['__proto__', 400], ['constructor', 404], ['prototype', 404], ['toString', 400], ['hasOwnProperty', 400], ['pool', 404], ['pool.', 400], ['.pool.resize', 400],
  ['pool..resize', 400], ['pool.resize.x', 404], ['pool.resizeX', 400], ['POOL.RESIZE', 400], ['pool.resize%20', 400], ['pool.resize%00', 400],
  ['pool%252eresize', 400], ['pool.r%D0%B5size', 400], ['pool.resiz', 404], ['pool.resize2', 404], ['a'.repeat(64), 404], ['a'.repeat(65), 400], ['native.execute', 404]
];
test('hostile command names are typed errors for every identity and authentication always comes first', () => withApp({}, async (context) => {
  const before = context.app.snapshot();
  for (const [name, status] of NAMES) {
    for (const identity of ['operator', 'visitor']) {
      const answer = await send(context, name, context.app.issueToken(identity), {});
      assert.equal(answer.status, status, `${identity} ${name}`);
      assert.equal(answer.json.error.code, status === 404 ? 'COMMAND_UNKNOWN' : 'COMMAND_NAME_INVALID');
    }
    assert.equal((await send(context, name, null, {})).status, 401, `unauthenticated ${name}`);
  }
  assert.deepEqual(context.app.snapshot(), before);
  const encoded = await send(context, 'pool%2eresize', context.app.issueToken('visitor'), { size: 4 });
  assert.equal(encoded.status, 403, 'a percent-encoded dot is the same command with the same permissions');
  assert.equal((await send(context, 'pool%2eresize', context.app.issueToken('operator'), { size: 4 })).status, 200);
}));

test('parallel clients of every role get exactly their own decisions and effects are applied one at a time', () => withApp({}, async (context) => {
  const tokens = Object.fromEntries(IDENTITIES.map((identity) => [identity, context.app.issueToken(identity)]));
  const forged = `c009_${'Z'.repeat(43)}`;
  const jobs = [];
  for (let index = 0; index < 60; index += 1) {
    const [call, status] = [
      [() => send(context, 'pool.resize', tokens.operator, { size: index % 21 }), 200], [() => send(context, 'pool.resize', tokens.visitor, { size: 20 }), 403],
      [() => send(context, 'run.create', tokens['conductor-a'], { name: `r${index}`, units: 1 }), 200], [() => send(context, 'pool.resize', tokens['conductor-b'], { size: 20 }), 403],
      [() => send(context, 'run.create', forged, { name: 'x', units: 1 }), 401]
    ][index % 5];
    jobs.push({ status, answer: call(), index });
  }
  const answers = await Promise.all(jobs.map((job) => job.answer));
  answers.forEach((answer, index) => assert.equal(answer.status, jobs[index].status, `job ${index}`));
  const { revision, state } = context.app.snapshot();
  assert.equal(revision, 24);
  assert.deepEqual(state.runs.map((run) => run.id), Array.from({ length: 12 }, (_, index) => `run-${String(index + 1).padStart(4, '0')}`));
  assert.equal(state.runs.every((run) => run.owner === 'conductor-a'), true);
  assert.ok([0, 5, 10, 15, 20, 4, 9, 14, 19, 3, 8, 13].includes(state.pool.size));
  const outcomes = context.app.auditLog().map((entry) => entry.outcome);
  assert.deepEqual(['applied', 'denied', 'unauthenticated'].map((name) => outcomes.filter((outcome) => outcome === name).length), [24, 24, 12]);
}));

test('conflicting framing and oversized headers are refused by the parser and change nothing', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  const before = context.app.snapshot();
  const both = await rawRequest(context, ['POST /v1/commands/pool.resize HTTP/1.1', 'Host: 127.0.0.1:{PORT}', `Authorization: Bearer ${operator}`,
    'Content-Type: application/json', 'Content-Length: 10', 'Transfer-Encoding: chunked', 'Connection: close', '', '0', '', ''].join('\r\n'));
  assert.equal(both.status, 400);
  const huge = await rawRequest(context, ['GET /v1/state HTTP/1.1', 'Host: 127.0.0.1:{PORT}', `X-Padding: ${'a'.repeat(20000)}`, 'Connection: close', '', ''].join('\r\n'));
  assert.equal(huge.status, 431);
  assert.deepEqual(context.app.snapshot(), before);
}));

test('only the exact 127.0.0.1 origin is served, whatever Host or Origin a client forges', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  const before = context.app.snapshot();
  const hosts = ['localhost:{P}', '127.0.0.1', '127.0.0.1:{P}.evil.test', '[::1]:{P}', '127.0.0.1:1', 'evil.test'];
  for (const host of hosts) {
    const answer = await send(context, 'pool.resize', operator, { size: 4 }, { Host: host.replace('{P}', context.port) });
    assert.equal(answer.status, 421, host);
    assert.equal(answer.json.error.code, 'LOCAL_HOST_REQUIRED');
  }
  for (const origin of ['null', 'http://127.0.0.1:1', `${context.origin}.evil.test`, 'https://127.0.0.1', '', context.origin.replace('http', 'https')]) {
    const answer = await send(context, 'pool.resize', operator, { size: 4 }, { Origin: origin });
    assert.equal(answer.status, 403, JSON.stringify(origin));
    assert.equal(answer.json.error.code, 'CROSS_ORIGIN_DENIED');
  }
  assert.deepEqual(context.app.snapshot(), before);
}));
