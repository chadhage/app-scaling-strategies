'use strict';

// C010 scenario "Hostile ids, paths, methods and fields are refused uniformly" (paths, ids and methods): path tricks over a raw socket (an http
// client would normalize or reject them), guessable sequential ids and method overrides. Each must leave the full state byte-identical and
// reveal nothing of another lease.
const assert = require('node:assert/strict');
const test = require('node:test');
const { bearer, exchange } = require('./raw-http.cjs');
const { call, same, seed, sequentialIds, target, withApp } = require('./helpers.cjs');

const TYPED = new Set(['TARGET_NOT_FOUND', 'NOT_FOUND', 'INVALID_URL', 'URL_TOO_LONG', 'REQUEST_MALFORMED', 'METHOD_NOT_ALLOWED', 'QUERY_NOT_ALLOWED']);

function trickRoutes(a, b) {
  const run = `/v1/leases/${a.lease}/runs/${a.run}`;
  return [
    `/v1/leases/${b.lease}/../${a.lease}/runs/${a.run}`, `/v1/leases/${b.lease}/runs/../../${a.lease}/runs/${a.run}`, `/v1/leases/./${a.lease}/runs/${a.run}`,
    `${run}/`, `${run}.`, `${run}%20`, `${run}%2e`, `/v1/leases/${a.lease}%2Fruns%2F${a.run}`, `/v1/leases/${a.lease}%252Fruns%252F${a.run}`,
    `/v1/leases/${b.lease}/%2e%2e/${a.lease}/runs/${a.run}`, `/v1/leases/${b.lease}/%2E%2E%2F${a.lease}/runs/${a.run}`, `/V1/LEASES/${a.lease}/RUNS/${a.run}`,
    `/v1/leases/${a.lease.toUpperCase()}/runs/${a.run.toUpperCase()}`, `/v1/leases/${a.lease}//runs/${a.run}`, `//v1/leases/${a.lease}/runs/${a.run}`,
    `/v1/leases/${a.lease}\\runs\\${a.run}`, `/v1/leases/${a.lease};x=1/runs/${a.run}`, `${run}%00`, `${run}#x`, `${run}?x=../`, `/v1/leases/${a.lease}/runs/%72un-${a.run.slice(4)}`,
    `/v1/leases/${a.lease}/runs/${a.run.replace('run-', 'run-\u0430')}`, `${run}\u200b`, `/v1/leases/${a.lease.replace('lease', 'l\u0435ase')}`,
    `/v1/leases/${a.lease}/runs/${a.run.replace(/[0-9]/, '\uff10')}`, `/v1/leases/lease-${'a'.repeat(100)}`, `/v1/leases/${a.lease}/runs/run-${'f'.repeat(400)}`,
    `/v1/leases/${a.lease}/${'x'.repeat(3000)}`, `http://127.0.0.1/v1/leases/${a.lease}/runs/${a.run}`, `${run}/cancel/extra`, `${run}/..`, `/v1/leases/${a.lease}/runs/*`
  ];
}

test('path tricks (dot segments, encoded and double encoded slashes, case, trailing characters, look-alikes, long ids, absolute form) never reach another lease', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const before = same(context.app.snapshot());
  const secrets = [ids.a.lease, ids.a.run, ids.a.scratch, ids.a.export, 'run-a', 'scratch-a', 'lease-a', 'conductor-a'];
  const seen = new Set();
  for (const identity of ['conductor-b', 'operator', 'visitor']) {
    for (const route of trickRoutes(ids.a, ids.b)) {
      for (const method of ['GET', 'DELETE']) {
        const bytes = Buffer.from(`${method} ${route} HTTP/1.1\r\nHost: 127.0.0.1:${context.port}\r\n${bearer(tokens[identity])}\r\n\r\n`, 'utf8');
        const { answers, closedByServer } = await exchange(context.port, bytes);
        const label = `${identity} ${method} ${route.slice(0, 90)}`;
        assert.ok(answers.length <= 1, `${label}: one answer at most`);
        for (const answer of answers) {
          assert.ok(answer.json, `${label}: a JSON answer`);
          assert.ok(answer.status >= 400, `${label}: ${answer.status}`);
          assert.equal(answer.json.outcome, answer.json.error.code, `${label}: a typed refusal`);
          seen.add(answer.json.error.code);
          if (identity === 'conductor-b') assert.ok(TYPED.has(answer.json.error.code), `${label}: ${answer.json.error.code}`);
          for (const secret of secrets) assert.equal(answer.text.includes(secret), false, `${label} reveals ${secret}`);
        }
        assert.equal(closedByServer, true, `${label}: the refusal ends the connection`);
        assert.deepEqual(context.app.snapshot(), before, `${label} must have no effect`);
      }
    }
  }
  for (const code of ['TARGET_NOT_FOUND', 'NOT_FOUND', 'INVALID_URL', 'URL_TOO_LONG']) assert.ok(seen.has(code), `the tricks reached ${code}: ${[...seen]}`);
}));

test('a plain foreign id answers the one uniform refusal that no trick may beat, and an absent id answers the same bytes', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const plain = await call(context, tokens['conductor-b'], 'GET', target(ids.a, 'run'));
  assert.equal(plain.status, 404);
  assert.equal(plain.json.error.code, 'TARGET_NOT_FOUND');
  const absent = await call(context, tokens['conductor-b'], 'GET', `/v1/leases/${ids.a.lease}/runs/run-eeeeeeeeeeeeeeee`);
  assert.equal(absent.text, plain.text);
}));

test('guessable sequential ids give an attacker nothing: every guessed id of every kind in the neighbouring range is refused or is its own', () => withApp({ app: { newId: sequentialIds() } }, async (context) => {
  const { tokens, ids } = await seed(context);
  assert.match(ids.a.lease, /^lease-0000000[0-9a-f]$/, 'the ids of this server are sequential and guessable');
  const before = same(context.app.snapshot());
  const hits = [];
  for (let n = 1; n <= 20; n += 1) {
    const hex = n.toString(16).padStart(8, '0');
    for (const [kind, folder] of [['run', 'runs'], ['scratch', 'scratches'], ['export', 'exports']]) {
      for (const lease of [ids.a.lease, ids.b.lease]) {
        const answer = await call(context, tokens['conductor-b'], 'GET', `/v1/leases/${lease}/${folder}/${kind}-${hex}`);
        if (answer.status === 200) hits.push(`${lease}/${kind}-${hex}`);
        else assert.equal(answer.json.error.code, 'TARGET_NOT_FOUND');
      }
    }
    const answer = await call(context, tokens['conductor-b'], 'GET', `/v1/leases/lease-${hex}`);
    if (answer.status === 200) hits.push(`lease-${hex}`);
  }
  const mine = [ids.b.lease, `${ids.b.lease}/${ids.b.run}`, `${ids.b.lease}/${ids.b.scratch}`, `${ids.b.lease}/${ids.b.export}`];
  assert.deepEqual(hits.sort(), mine.sort(), 'only conductor-b\'s own ids answer');
  assert.deepEqual(context.app.snapshot(), before);
}));

test('method override headers are never obeyed: the real method decides, for an own and for a foreign target', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const overrides = [{ 'X-HTTP-Method-Override': 'DELETE' }, { 'X-Method-Override': 'DELETE' }, { 'X-HTTP-Method': 'DELETE' }, { 'X-HTTP-Method-Override': 'PATCH' }];
  for (const headers of overrides) {
    const own = await call(context, tokens['conductor-b'], 'GET', target(ids.b, 'run'), undefined, headers);
    assert.equal(own.status, 200, JSON.stringify(headers));
    assert.equal(own.json.resource.id, ids.b.run);
    assert.ok(own.json.ignoredClaims.includes(Object.keys(headers)[0].toLowerCase()), 'the override header is reported by name');
    const foreign = await call(context, tokens['conductor-b'], 'GET', target(ids.a, 'run'), undefined, headers);
    assert.equal(foreign.status, 404);
    const created = await call(context, tokens['conductor-b'], 'POST', `/v1/leases/${ids.b.lease}/scratches`, { name: 'by-post' }, headers);
    assert.equal(created.status, 200, 'a POST stays a POST');
    assert.equal((await call(context, tokens['conductor-b'], 'DELETE', `/v1/leases/${ids.b.lease}/scratches/${created.json.resource.id}`)).status, 200);
  }
  assert.ok(context.app.snapshot().leases.every((lease) => lease.runs.length === 1 && lease.exports.length === 1 && lease.scratches.length === 1), 'nothing was deleted by an override');
}));

test('methods outside the route table are refused with the allowed list, for an own, a foreign and an absent target alike', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const before = same(context.app.snapshot());
  for (const method of ['PUT', 'OPTIONS', 'TRACE', 'PROPFIND', 'COPY', 'LINK', 'PURGE', 'MKCOL', 'HEAD']) {
    const answers = [];
    for (const lease of [ids.b.lease, ids.a.lease, 'lease-ffffffffffffffff']) answers.push(await call(context, tokens['conductor-b'], method, `/v1/leases/${lease}/runs/${ids.b.run}`));
    for (const answer of answers) {
      assert.equal(answer.status, 405, method);
      assert.equal(answer.headers.allow, 'DELETE, GET, PATCH');
    }
    assert.equal(answers[0].text, answers[1].text, `${method}: an own and a foreign target get the same 405`);
    assert.equal(answers[1].text, answers[2].text);
  }
  assert.equal((await call(context, tokens['conductor-b'], 'PATCH', `/v1/leases/${ids.b.lease}`, { name: 'x' })).headers.allow, 'DELETE, GET');
  assert.equal((await call(context, tokens['conductor-b'], 'PATCH', target(ids.b, 'export'), { name: 'x' })).headers.allow, 'DELETE, GET');
  assert.deepEqual(context.app.snapshot(), before);
}));
