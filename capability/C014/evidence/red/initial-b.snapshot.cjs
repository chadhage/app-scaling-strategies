'use strict';

// RED snapshot of the initial specification tests (C014.feature, part 2): the refusal path of the server. Immutable after it is archived.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seedConfig } = require('./canaries.snapshot.cjs');
const { loadSubject, build, exchange, parseAnswers, call } = require('./harness.snapshot.cjs');

async function withService(body) {
  const config = seedConfig();
  const local = await loadSubject().startLocal({ config });
  try { return await body({ local, config, port: local.port }); } finally { await local.close(); }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const authorize = (token) => ({ Authorization: `Bearer ${token}` });

// Every refusal the server can produce is a typed answer that announces Connection: close and is followed by the end of the connection.
const rows = (port, tokens) => [
  ['401 no credential', 401, build('POST', '/v1/commands/run.create', { port, headers: JSON_HEADERS, body: { name: 'a', units: 1 } })],
  ['401 forged token', 401, build('POST', '/v1/commands/run.create', { port, headers: { ...JSON_HEADERS, ...authorize(`c009_${'A'.repeat(43)}`) }, body: { name: 'a', units: 1 } })],
  ['403 visitor', 403, build('POST', '/v1/commands/run.create', { port, headers: { ...JSON_HEADERS, ...authorize(tokens.visitor) }, body: { name: 'a', units: 1 } })],
  ['404 unknown command', 404, build('POST', '/v1/commands/nothing.here', { port, headers: { ...JSON_HEADERS, ...authorize(tokens.operator) }, body: {} })],
  ['400 bad command name', 400, build('POST', '/v1/commands/BAD', { port, headers: { ...JSON_HEADERS, ...authorize(tokens.operator) }, body: {} })],
  ['405 method', 405, build('PUT', '/v1/evidence/runs', { port })],
  ['400 invalid json (decided after the body is read)', 400, build('POST', '/v1/commands/run.create', { port, headers: { ...JSON_HEADERS, ...authorize(tokens['conductor-a']) }, body: '{' })],
  ['415 media type', 415, build('POST', '/v1/commands/run.create', { port, headers: { 'Content-Type': 'text/plain', ...authorize(tokens['conductor-a']) }, body: 'x' })],
  ['413 body too large', 413, build('POST', '/v1/commands/run.create', { port, headers: { ...JSON_HEADERS, ...authorize(tokens['conductor-a']) }, body: `{"name":"${'a'.repeat(6000)}"}` })],
  ['414 URL too long', 414, build('GET', `/${'a'.repeat(3000)}`, { port })],
  ['421 wrong host', 421, build('GET', '/scope.json', { port, host: 'example.invalid' })],
  ['403 cross origin', 403, build('GET', '/scope.json', { port, headers: { Origin: 'http://evil.invalid' } })],
  ['417 expectation (answered by Node itself unless the server listens)', 417, build('POST', '/v1/commands/run.create', { port, headers: { ...JSON_HEADERS, Expect: 'nonsense', ...authorize(tokens['conductor-a']) }, body: { name: 'a', units: 1 } })],
  ['404 unknown route with a body', 404, build('POST', '/v1/nowhere', { port, headers: JSON_HEADERS, body: { x: 1 } })],
  ['400 body on a read', 400, build('GET', '/scope.json', { port, headers: JSON_HEADERS, body: '{"a":1}' })],
  ['431 headers too large', 431, build('GET', '/scope.json', { port, headers: { 'X-Big': 'b'.repeat(17000) } })]
];

test('every refusal is a typed answer with Connection: close, and the server ends the connection', { timeout: 60000 }, () => withService(async ({ local, config, port }) => {
  const table = rows(port, config.tokens);
  const results = await Promise.all(table.map(([, , bytes]) => exchange(port, bytes, { settleMs: 3000 })));
  table.forEach(([name, status], index) => {
    const [answer] = parseAnswers(results[index].bytes);
    assert.ok(answer, `${name}: an answer`);
    assert.equal(answer.status, status, name);
    assert.equal(answer.headers.connection, 'close', `${name}: announces Connection: close`);
    assert.equal(results[index].closed, true, `${name}: the server ends the connection`);
    const body = JSON.parse(answer.body.toString('utf8'));
    assert.match(body.outcome, /^[A-Z_]+$/, `${name}: a typed code`);
    assert.equal(body.error.code, body.outcome, name);
  });
  assert.equal((await call(port, 'GET', '/v1/evidence/runs')).json().total, 0, 'no refusal changed anything');
}));

const post = (port, token, name = 'pipelined') => build('POST', '/v1/commands/run.create', { port, headers: { ...JSON_HEADERS, ...authorize(token) }, body: { name, units: 1 } });
const get = (port, extra = {}) => build('GET', '/scope.json', { port, headers: extra });
const runs = async (port) => (await call(port, 'GET', '/v1/evidence/runs')).json().total;

test('nothing runs behind a refusal, and the answers of earlier requests come first (one TCP write per case)', { timeout: 90000 }, () => withService(async ({ config, port }) => {
  const visitor = config.tokens.visitor;
  const conductor = config.tokens['conductor-a'];
  const bad = build('POST', '/v1/commands/run.create', { port, headers: { ...JSON_HEADERS, ...authorize(conductor) }, body: '{' });
  const cases = [
    ['[refused 403][valid mutation]', [post(port, visitor), post(port, conductor)], [403]],
    ['[GET][refused 403][valid mutation]', [get(port), post(port, visitor), post(port, conductor)], [200, 403]],
    ['[refused after an await (400 invalid json)][valid mutation]', [bad, post(port, conductor)], [400]],
    ['[GET][GET][Expect: nonsense] (Node answers 417 itself)', [get(port), get(port), get(port, { Expect: 'nonsense' })], [200, 200, 417]],
    ['[GET][GET][GET][Expect: nonsense]', [get(port), get(port), get(port), get(port, { Expect: 'nonsense' })], [200, 200, 200, 417]],
    ['[GET][GET][Expect: nonsense][GET]', [get(port), get(port), get(port, { Expect: 'nonsense' }), get(port)], [200, 200, 417]]
  ];
  for (const [name, pieces, statuses] of cases) {
    const result = await exchange(port, Buffer.concat(pieces), { settleMs: 3000 });
    assert.deepEqual(parseAnswers(result.bytes).map((answer) => answer.status), statuses, `${name}: exactly the answers up to the refusal`);
    assert.equal(result.closed, true, `${name}: the connection is closed`);
    assert.equal(await runs(port), 0, `${name}: the mutation behind the refusal did not run`);
  }
  const first = await exchange(port, Buffer.concat([post(port, conductor), post(port, visitor)]), { settleMs: 3000 });
  assert.deepEqual(parseAnswers(first.bytes).map((answer) => answer.status), [200, 403], '[valid mutation][refused]: the first applies and is answered');
  assert.equal(await runs(port), 1);
}));
