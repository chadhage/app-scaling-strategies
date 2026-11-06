'use strict';

// Guards of server.cjs that the systematic mutation run (tests\mutate-gen.cjs, evidence\mutants-gen-03.json) found no test for: a chunked body is read, a
// non-plain JSON body is a typed refusal that starts nothing, the request target is bounded and must be our own origin without a fragment, the media
// type may carry a charset, the remote address and an empty target are checked on a fake exchange (a loopback socket cannot show them), and the
// clientError listener answers only a socket that is writable and has written nothing, always destroys it and types its answer.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const s = require('./support.cjs');
const h = require('./http.cjs');
const C = require('../contract.js');
const { createLocalServer, listen, closeOwned } = require('../server.cjs');

const hostOf = (origin) => `Host: ${new URL(origin).host}\r\n`;
const statusOf = (text) => Number((/^HTTP\/1\.1 (\d{3}) /.exec(text) || [0, 0])[1]);
const codeOf = (text) => { try { return JSON.parse(text.slice(text.indexOf('\r\n\r\n') + 4)).error.code; } catch { return null; } };
const untouched = (env) => env.ctx.engine.view().journal.filter((entry) => entry.type !== 'boot').length;

test('a small chunked command body is read and executed, like a body with a content length', { timeout: 60000 }, async (t) => {
  const env = await h.serve(t);
  const answer = await h.request(env.origin, { method: 'POST', path: '/api/start', chunked: true, headers: { ...h.jsonHeaders, 'Transfer-Encoding': 'chunked' }, body: JSON.stringify(s.startCmd('chunked-key-0001')) });
  assert.equal(answer.status, 202, answer.text);
  assert.ok(answer.json.action, 'the chunked command started the action');
});

test('a JSON body that is not a plain command object, or a command of another kind, is a typed 400 that starts nothing', { timeout: 60000 }, async (t) => {
  const env = await h.serve(t);
  for (const body of ['null', '[]', '"start"', '7', 'true']) {
    const answer = await h.post(env.origin, '/api/cancel', body);
    assert.equal(answer.status, 400, body);
    assert.equal(answer.json.error.code, 'INVALID_COMMAND', body);
  }
  const wrongKind = await h.post(env.origin, '/api/cancel', s.startCmd('wrong-route-0001'));
  assert.equal(wrongKind.status, 400);
  assert.equal(wrongKind.json.error.code, 'INVALID_COMMAND');
  assert.equal(untouched(env), 0, 'nothing ran behind the refusals');
});

test('the media type may carry a charset in any case and with or without a space; another type is refused', { timeout: 60000 }, async (t) => {
  const env = await h.serve(t);
  const started = await h.request(env.origin, { method: 'POST', path: '/api/start', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(s.startCmd('charset-key-0001')) });
  assert.equal(started.status, 202, started.text);
  const compact = await h.request(env.origin, { method: 'POST', path: '/api/reconcile', headers: { 'Content-Type': 'application/json;charset=utf-8' }, body: '{}' });
  assert.notEqual(compact.status, 415, 'the compact charset form is a JSON media type');
  const other = await h.request(env.origin, { method: 'POST', path: '/api/reconcile', headers: { 'Content-Type': 'application/json; charset=latin1' }, body: '{}' });
  assert.equal(other.status, 415);
});

test('a request target must be our own origin without a fragment and at most 512 characters, in absolute and in origin form', { timeout: 60000 }, async (t) => {
  const env = await h.serve(t);
  const { port } = new URL(env.origin);
  const ask = async (target) => { const client = h.raw(env.origin, `GET ${target} HTTP/1.1\r\n${hostOf(env.origin)}\r\n`); await client.closed; return client.text(); };
  assert.equal(statusOf(await ask(`http://127.0.0.1:${port}/api/state`)), 200, 'the control: our own absolute-form target is served');
  assert.equal(statusOf(await ask('http://evil.example/api/state')), 404, 'another origin in the target');
  assert.equal(statusOf(await ask(`http://u:${'a'.repeat(600)}@127.0.0.1:${port}/api/state`)), 404, 'a target longer than 512 characters');
  assert.equal(statusOf(await ask('/api/state#fragment')), 404, 'a fragment');
  assert.equal(statusOf(await ask('/api/state?x=1')), 404, 'a query');
  for (const target of [`http://evil.example/api/state`, '/api/state#fragment']) assert.equal(codeOf(await ask(target)), 'NOT_FOUND', target);
});

function fakeExchange(env, { remoteAddress = '127.0.0.1', url = '/api/state', method = 'GET', headers = {} } = {}) {
  const socket = Object.assign(new EventEmitter(), { remoteAddress, destroyed: false, bytesRead: 0, destroy() { this.destroyed = true; } });
  const request = Object.assign(new EventEmitter(), { socket, method, url, headers: { host: new URL(env.origin).host, ...headers } });
  const sent = {};
  const done = new Promise((resolve) => {
    const response = {
      headersSent: false, writeHead(status, head) { sent.status = status; sent.head = head; },
      end(body, callback) { sent.body = body; resolve(); if (callback) callback(); },
    };
    sent.response = response;
  });
  return { request, socket, sent, done, run: async () => { env.server.emit('request', request, sent.response); await done; socket.emit('close'); return { status: sent.status, code: (() => { try { return JSON.parse(sent.body.toString('utf8')).error.code; } catch { return null; } })() }; } };
}

test('a request from another remote address or with an empty target is refused (fake exchange: a loopback socket cannot show either)', { timeout: 60000 }, async (t) => {
  const env = await h.serve(t);
  assert.deepEqual(await fakeExchange(env).run(), { status: 200, code: null }, 'the control: the same fake exchange from 127.0.0.1 is served');
  assert.deepEqual(await fakeExchange(env, { remoteAddress: '10.0.0.7' }).run(), { status: 403, code: 'FORBIDDEN_ORIGIN' });
  assert.deepEqual(await fakeExchange(env, { url: '' }).run(), { status: 404, code: 'NOT_FOUND' });
  assert.equal(untouched(env), 0);
});

function fakeSocket({ writable = true, bytesWritten = 0 } = {}) {
  return { writable, bytesWritten, written: [], destroyed: false, write(chunk) { this.written.push(Buffer.from(chunk).toString('utf8')); }, destroy() { this.destroyed = true; } };
}

test('the clientError listener answers with a typed failure only a socket that is writable and has written nothing, and always destroys it', { timeout: 60000 }, async (t) => {
  const env = await h.serve(t);
  const answer = (error, options) => { const socket = fakeSocket(options); env.server.emit('clientError', error, socket); return socket; };
  const malformed = answer(Object.assign(new Error('x'), { code: 'HPE_INVALID_METHOD' }));
  assert.match(malformed.written[0], /^HTTP\/1\.1 400 Bad Request\r\n/);
  assert.equal(JSON.parse(malformed.written[1]).error.code, 'MALFORMED_REQUEST');
  assert.equal(malformed.destroyed, true);
  const oversize = answer(Object.assign(new Error('x'), { code: 'HPE_HEADER_OVERFLOW' }));
  assert.match(oversize.written[0], /^HTTP\/1\.1 431 /);
  assert.equal(JSON.parse(oversize.written[1]).error.code, 'HEADERS_TOO_LARGE');
  assert.equal(JSON.parse(answer(null).written[1]).error.code, 'MALFORMED_REQUEST', 'an error object is not required');
  for (const [name, options] of [['a socket that already wrote an answer', { bytesWritten: 5 }], ['a socket that is not writable', { writable: false }]]) {
    const refused = answer(Object.assign(new Error('x'), { code: 'HPE_INVALID_METHOD' }), options);
    assert.deepEqual(refused.written, [], `${name}: nothing more is written`);
    assert.equal(refused.destroyed, true, `${name}: still destroyed`);
  }
  assert.equal(C.failure('MALFORMED_REQUEST').status, 400);
  assert.equal(C.failure('HEADERS_TOO_LARGE').status, 431);
});

test('listen() rejects with the error the server reports before it listens, instead of leaving it unhandled', { timeout: 60000 }, async (t) => {
  const ctx = s.boot();
  t.after(() => ctx.cleanup());
  const server = createLocalServer({ engine: ctx.engine });
  const listening = new Promise((resolve) => server.once('listening', resolve));
  const pending = listen(server);
  server.emit('error', new Error('synthetic listen failure'));
  await assert.rejects(pending, /synthetic listen failure/);
  // The real bind still completes after the fake error: it is waited for and closed, or the open handle would keep this test process alive.
  await listening;
  await closeOwned(server);
});

test('a client that aborts in the middle of a body leaves the server serving and its journal untouched', { timeout: 60000 }, async (t) => {
  const env = await h.serve(t);
  const reading = new Promise((resolve) => env.server.once('request', resolve));
  const body = JSON.stringify(s.cancelCmd('abort-key-0001', 'x'));
  const client = h.raw(env.origin, `POST /api/cancel HTTP/1.1\r\n${hostOf(env.origin)}Content-Type: application/json\r\nContent-Length: ${body.length + 50}\r\n\r\n${body.slice(0, 10)}`);
  await reading;
  client.socket.destroy();
  await client.closed;
  assert.equal((await h.get(env.origin, '/api/state')).status, 200);
  assert.equal(untouched(env), 0);
});
