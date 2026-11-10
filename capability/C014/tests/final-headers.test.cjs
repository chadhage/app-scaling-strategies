'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startLocal } = require('../server.cjs');
const { seedConfig } = require('./canaries.cjs');
const { call, exchange, parseAnswers, build } = require('./harness.cjs');

const FIXED = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
};
function headers(answer, label) {
  assert.ok(answer && answer.status >= 200, `${label}: a final answer was actually read`);
  for (const [name, value] of Object.entries(FIXED)) {
    assert.equal(answer.headers[name], value, `${label}: ${name}`);
    assert.equal(answer.head.split('\r\n').filter((line) => line.toLowerCase().startsWith(`${name}:`)).length, 1, `${label}: exactly one ${name}`);
  }
  assert.deepEqual(Object.keys(answer.headers).filter((name) => /^(set-cookie|location|access-control-.*|link|refresh|sourcemap|x-sourcemap)$/.test(name)), [], label);
}

test('G8 fixed headers on 327 real final answers: route-role table, methods, POST body refusals and seventeen Node-own/raw shapes', { timeout: 170000 }, async () => {
  const config = seedConfig();
  const app = await startLocal({ config });
  let count = 0;
  const take = async (label, operation) => { const result = await operation; headers(result.answer, label); count += 1; };
  try {
    const expired = app.service.issueToken('operator', { ttlMs: 0 });
    const identities = [null, ...Object.values(config.tokens), `c009_${'A'.repeat(43)}`, 'malformed', expired];
    assert.equal(identities.length, 8);
    const routes = ['/', '/page.js', '/style.css', '/scope.json', '/v1/manage/config', '/v1/evidence/trace', '/v1/evidence/runs',
      '/v1/evidence/audit', '/v1/evidence/logs', '/v1/evidence/bundle', '/v1/commands/run.create', '/v1/commands/config.check',
      '/v1/nowhere', '/%zz', '/index.html', '/favicon.ico', '/.git/config', '/v1/evidence/trace/', '/v1/evidence/TRACE',
      '/x/v1/evidence/trace', '/v1/evidence/trace/y', '/scope.json?x=1', '/v1/evidence/trace?limit=0',
      '/v1/evidence/trace?limit=abc', '/v1/evidence/trace?limit=200', '/v1/evidence/bundle?x=1', '//'];
    assert.equal(routes.length, 27);
    for (const route of routes) for (const token of identities) await take('route and identity', call(app.port, 'GET', route, { token }));
    for (const route of ['/', '/scope.json', '/v1/evidence/trace', '/v1/commands/run.create']) {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT']) await take('method', call(app.port, method, route));
    }
    for (const token of identities) await take('POST identity', call(app.port, 'POST', '/v1/commands/run.create', { token, body: { name: 'header-run', units: 1 } }));
    const bodies = [
      { body: { name: 'body-run', units: 1 } }, { body: '{' }, { body: [] }, { body: {} }, { body: { extra: 'x' } },
      { body: { name: 'bad', units: -1 } }, { body: 'x'.repeat(5000) }, { body: {}, headers: { 'Content-Type': 'text/plain' } },
      { body: {}, headers: { 'Content-Type': null } }, { body: {}, headers: { Authorization: 'Basic ZmljdGlvbmFsOm9ubHk=' } }
    ];
    for (const token of [null, config.tokens.visitor, config.tokens['conductor-a'], config.tokens.operator, expired]) {
      for (const body of bodies) await take('POST body/media/refusal', call(app.port, 'POST', '/v1/commands/run.create', { token, ...body }));
    }
    const host = `Host: 127.0.0.1:${app.port}\r\n`;
    const post = JSON.stringify({ name: 'raw-header-run', units: 1 });
    const raw = [
      'garbage\r\n\r\n',
      `GET /scope.json HTTP/1.1\r\n${host}invalid header\r\n\r\n`,
      `GET /scope.json HTTP/1.1\r\n${host}X-Large: ${'x'.repeat(70000)}\r\n\r\n`,
      `GET /${'x'.repeat(20000)} HTTP/1.1\r\n${host}\r\n`,
      `GET /scope.json HTTP/1.1\r\n${host}Expect: nonsense\r\n\r\n`,
      build('POST', '/v1/commands/run.create', { port: app.port, headers: { Authorization: `Bearer ${config.tokens['conductor-a']}`, Expect: '100-continue', 'Content-Type': 'application/json', Connection: 'close' }, body: post }),
      `CONNECT /scope.json HTTP/1.1\r\n${host}\r\n`,
      'GET /scope.json HTTP/1.1\r\n\r\n',
      'GET /scope.json HTTP/1.1\r\nHost: foreign.invalid\r\n\r\n',
      `GET http://foreign.invalid/scope.json HTTP/1.1\r\n${host}\r\n`,
      `GET /scope.json HTTP/1.1\r\n${host}Upgrade: websocket\r\nConnection: close\r\n\r\n`,
      `GET /scope.json HTTP/1.0\r\n${host}\r\n`,
      'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n',
      `POST /v1/commands/run.create HTTP/1.1\r\n${host}Transfer-Encoding: chunked\r\nContent-Length: 1\r\n\r\n0\r\n\r\n`,
      `POST /v1/commands/run.create HTTP/1.1\r\n${host}Transfer-Encoding: chunked\r\nContent-Type: application/json\r\n\r\nz\r\nx\r\n`,
      `GET /scope.json HTTP/1.1\r\n${host}X-Nul: \0\r\n\r\n`,
      `GET /scope.json HTTP/1.1\nHost: 127.0.0.1:${app.port}\nConnection: close\n\n`
    ];
    assert.equal(raw.length, 17);
    for (let index = 0; index < raw.length; index += 1) {
      const result = await exchange(app.port, raw[index], { settleMs: 30000 });
      const answers = parseAnswers(result.bytes);
      assert.equal(answers.length, 1, `raw shape ${index}: exactly one final answer (interim 100 is not a final answer)`);
      headers(answers[0], `raw shape ${index}`);
      count += 1;
    }
    assert.equal(count, 327, 'all declared cells really produced a checked final answer');
  } finally { await app.close(); }
});
