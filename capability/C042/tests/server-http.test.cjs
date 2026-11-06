'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const contract = require('../contract.js');
const { call, cleanup, journalBytes, journalLines, raw, rawHttp, startService, valid } = require('./support.cjs');

const body = JSON.stringify(valid());
const honest = (response) => {
  assert.equal(response.status >= 200 && response.status < 300, response.json.accepted, response.text);
  assert.deepEqual(contract.validateResultEnvelope(response.json), { ok: true, problems: [] }, response.text);
};
const head = (port, method, target, extra = []) => [`${method} ${target} HTTP/1.1`, `Host: 127.0.0.1:${port}`, 'Connection: close', ...extra];

test('every hostile request is a typed refusal that changes nothing and keeps the service healthy', async () => {
  const service = await startService();
  const { port } = service;
  try {
    const before = journalBytes(service.dir);
    const cases = [
      ['a foreign Host', [`POST /v1/steps HTTP/1.1`, 'Host: evil.example', 'Connection: close', 'Content-Type: application/json', `Content-Length: ${body.length}`], body, 421, 'LOCAL_HOST_REQUIRED'],
      ['a Host with another port', [`POST /v1/steps HTTP/1.1`, `Host: 127.0.0.1:${port + 1}`, 'Connection: close'], '', 421, 'LOCAL_HOST_REQUIRED'],
      ['a foreign Origin with a valid body', head(port, 'POST', '/v1/steps', ['Origin: http://evil.example', 'Content-Type: application/json', `Content-Length: ${body.length}`]), body, 403, 'CROSS_ORIGIN_DENIED'],
      ['an Origin of null', head(port, 'POST', '/v1/steps', ['Origin: null', 'Content-Type: application/json', `Content-Length: ${body.length}`]), body, 403, 'CROSS_ORIGIN_DENIED'],
      ['an absolute-form target', head(port, 'GET', 'http://evil.example/v1/leases'), '', 400, 'INVALID_URL'],
      ['a fragment', head(port, 'GET', '/v1/leases#x'), '', 400, 'INVALID_URL'],
      ['an invalid target', head(port, 'GET', '//'), '', 400, 'INVALID_URL'],
      ['a very long URL', head(port, 'GET', `/${'a'.repeat(2100)}`), '', 414, 'URL_TOO_LONG'],
      ['a query on a read route', head(port, 'GET', '/v1/leases?x=1'), '', 400, 'INVALID_QUERY'],
      ['a query on the submit route', head(port, 'POST', '/v1/steps?x=1', ['Content-Type: application/json', `Content-Length: ${body.length}`]), body, 400, 'INVALID_QUERY'],
      ['a body on a GET', head(port, 'GET', '/v1/leases', ['Content-Length: 2']), '{}', 400, 'UNEXPECTED_BODY'],
      ['a chunked GET', head(port, 'GET', '/v1/leases', ['Transfer-Encoding: chunked']), '0\r\n\r\n', 400, 'UNEXPECTED_BODY'],
      ['a body on an action', head(port, 'POST', `/v1/steps/${valid().idempotencyKey}/cancel`, ['Content-Length: 2']), '{}', 400, 'UNEXPECTED_BODY'],
      ['PUT on the submit route', head(port, 'PUT', '/v1/steps'), '', 405, 'METHOD_NOT_ALLOWED'],
      ['DELETE on a step', head(port, 'DELETE', `/v1/steps/${valid().idempotencyKey}`), '', 405, 'METHOD_NOT_ALLOWED'],
      ['GET on an action', head(port, 'GET', `/v1/steps/${valid().idempotencyKey}/cancel`), '', 405, 'METHOD_NOT_ALLOWED'],
      ['POST on the ledger', head(port, 'POST', '/v1/leases', ['Content-Length: 0']), '', 405, 'METHOD_NOT_ALLOWED'],
      ['PATCH on the page', head(port, 'PATCH', '/'), '', 405, 'METHOD_NOT_ALLOWED'],
      ['an unknown route', head(port, 'GET', '/admin'), '', 404, 'NOT_FOUND'],
      ['a trailing slash', head(port, 'GET', '/v1/steps/'), '', 404, 'NOT_FOUND'],
      ['an extra path segment', head(port, 'POST', `/v1/steps/${valid().idempotencyKey}/cancel/extra`, ['Content-Length: 0']), '', 404, 'NOT_FOUND'],
      ['an upper-case route', head(port, 'GET', '/V1/LEASES'), '', 404, 'NOT_FOUND'],
      ['an upper-case action', head(port, 'POST', `/v1/steps/${valid().idempotencyKey}/Cancel`, ['Content-Length: 0']), '', 404, 'NOT_FOUND'],
      ['no transcript on this instance', head(port, 'GET', '/transcript.json'), '', 404, 'NOT_FOUND'],
      ['an encoded traversal as the key', head(port, 'GET', '/v1/steps/%2e%2e%2fscope'), '', 400, 'INVALID_FORMAT'],
      ['a key that is too short', head(port, 'POST', '/v1/steps/short/cancel', ['Content-Length: 0']), '', 400, 'INVALID_FORMAT'],
    ];
    for (const [name, lines, tail, status, code] of cases) {
      const response = await raw(port, lines, tail);
      assert.deepEqual([response.status, response.json?.error?.code], [status, code], `${name}: ${response.text}`);
      honest(response);
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.match(response.headers['content-security-policy'], /form-action 'none'/);
      assert.equal(response.json.effect.applied, false, name);
    }
    assert.equal((await raw(port, head(port, 'PUT', '/v1/steps'))).headers.allow, 'POST');
    assert.equal((await raw(port, head(port, 'DELETE', `/v1/steps/${valid().idempotencyKey}`))).headers.allow, 'GET');
    const headResponse = await rawHttp(port, `HEAD /v1/leases HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
    assert.equal(headResponse.status, 405);
    assert.deepEqual(journalBytes(service.dir), before);
    assert.equal((await call(port, 'POST', '/v1/steps', body)).status, 201, 'the service is still healthy');
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('a refused request whose body was not read is closed after its answer, and a read body keeps the connection alive', async () => {
  const service = await startService();
  const { port } = service;
  try {
    const refusals = [
      [head(port, 'GET', '/v1/leases', ['Content-Length: 2']), '{}', 400, 'UNEXPECTED_BODY'],
      [head(port, 'POST', `/v1/steps/${valid().idempotencyKey}/resume`, ['Content-Length: 2']), '{}', 400, 'UNEXPECTED_BODY'],
      [head(port, 'PUT', '/v1/steps', ['Content-Length: 2']), '{}', 405, 'METHOD_NOT_ALLOWED'],
      [head(port, 'POST', '/admin', ['Content-Length: 2']), '{}', 404, 'NOT_FOUND'],
      [head(port, 'POST', '/v1/steps', ['Content-Type: text/plain', 'Content-Length: 2']), '{}', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ].map(([lines, tail, status, code]) => [lines.filter((line) => line !== 'Connection: close'), tail, status, code]);
    for (const [lines, tail, status, code] of refusals) {
      const response = await raw(port, lines, tail);
      assert.deepEqual([response.status, response.json.error.code, response.headers.connection], [status, code, 'close'], lines[0]);
    }
    const kept = await raw(port, head(port, 'POST', '/v1/steps', ['Content-Type: application/json', `Content-Length: ${body.length}`]).filter((line) => line !== 'Connection: close'), body);
    assert.deepEqual([kept.status, kept.headers.connection], [201, 'keep-alive'], 'a body that was read leaves the connection alive');
    const bare = await raw(port, head(port, 'GET', '/v1/leases').filter((line) => line !== 'Connection: close'));
    assert.deepEqual([bare.status, bare.headers.connection], [200, 'keep-alive']);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('content types, body limits and malformed framing', async () => {
  const service = await startService();
  const { port } = service;
  try {
    for (const [index, type] of ['application/json', 'APPLICATION/JSON', 'application/json; charset=utf-8', 'application/json;charset=UTF-8'].entries()) {
      const response = await call(port, 'POST', '/v1/steps', JSON.stringify(valid({ idempotencyKey: `key-000${index}-type-aa` })), { 'Content-Type': type });
      assert.equal(response.status, 201, type);
    }
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonp', 'application/json; charset=latin1',
      'application/json, text/plain', 'application/json; charset=utf-8; x=y', '']) {
      const response = await call(port, 'POST', '/v1/steps', body, { 'Content-Type': type });
      assert.deepEqual([response.status, response.json.error.code, response.json.outcome], [415, 'UNSUPPORTED_MEDIA_TYPE', 'rejected'], type);
      honest(response);
    }
    const missing = await raw(port, head(port, 'POST', '/v1/steps', [`Content-Length: ${body.length}`]), body);
    assert.deepEqual([missing.status, missing.json.error.code], [415, 'UNSUPPORTED_MEDIA_TYPE']);
    const padded = `${body}${' '.repeat(2048 - body.length)}`;
    const exact = await call(port, 'POST', '/v1/steps', padded.replace('key-0001-aaaa', 'key-0001-exac'));
    assert.equal(exact.status, 201, exact.text);
    const lines = journalLines(service.dir).length;
    const over = await call(port, 'POST', '/v1/steps', `${padded} `);
    assert.deepEqual([over.status, over.json.error.code, over.headers.connection], [413, 'BODY_TOO_LARGE', 'close']);
    const chunk = 'x'.repeat(1500);
    const chunked = await raw(port, head(port, 'POST', '/v1/steps', ['Content-Type: application/json', 'Transfer-Encoding: chunked']),
      `5dc\r\n${chunk}\r\n5dc\r\n${chunk}\r\n0\r\n\r\n`);
    assert.deepEqual([chunked.status, chunked.json.error.code], [413, 'BODY_TOO_LARGE']);
    const both = await raw(port, head(port, 'POST', '/v1/steps', ['Content-Type: application/json', `Content-Length: ${body.length}`, 'Transfer-Encoding: chunked']), body);
    assert.equal(both.status, 400);
    assert.equal(journalLines(service.dir).length, lines + 0, 'no refused request wrote anything');
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('a client that sends half a body and vanishes changes nothing', async () => {
  const service = await startService();
  const { port } = service;
  try {
    const closed = new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => {
        socket.write(`POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body.slice(0, 20)}`);
        socket.destroy();
      });
      socket.on('close', resolve);
      socket.on('error', () => {});
    });
    await closed;
    const probe = await call(port, 'GET', '/v1/leases');
    assert.equal(probe.json.leases['synthetic-lease-001'].committed, 0);
    assert.deepEqual(journalLines(service.dir), []);
    const stillWorks = await call(port, 'POST', '/v1/steps', body);
    assert.equal(stillWorks.status, 201);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('the page, its scripts and the scope are served with strict headers and no query', async () => {
  const service = await startService();
  const { port } = service;
  try {
    const expected = { '/': 'text/html; charset=utf-8', '/contract.js': 'text/javascript; charset=utf-8', '/page.js': 'text/javascript; charset=utf-8', '/styles.css': 'text/css; charset=utf-8' };
    for (const [route, type] of Object.entries(expected)) {
      const response = await call(service.port, 'GET', route);
      assert.equal(response.status, 200, route);
      assert.equal(response.headers['content-type'], type);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers['x-c042-scope'], 'synthetic-loopback-only');
      assert.equal(response.text, fs.readFileSync(path.join(__dirname, '..', route === '/' ? 'index.html' : route.slice(1)), 'utf8'));
      assert.equal((await call(port, 'GET', `${route}?x=1`)).status, 400);
    }
    const html = (await call(port, 'GET', '/')).text;
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i, 'no inline script');
    assert.doesNotMatch(html, /\son[a-z]+=/i, 'no inline handlers');
    const scope = (await call(port, 'GET', '/scope.json')).json;
    assert.deepEqual([scope.cardId, scope.liveAzureRuns, scope.authorizedCloudSpend, scope.identityVerified, scope.realServiceRegistered, scope.c017ReconciliationImplemented],
      ['C042', 0, 0, false, false, false]);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});
