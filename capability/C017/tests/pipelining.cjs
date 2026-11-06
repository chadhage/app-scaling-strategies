'use strict';

// Test tooling, not production code: raw-socket helpers and the refusal catalogue of pipelining.test.cjs (second independent review F12 and
// orders\_PIPELINING.md). Every case is ONE TCP write (or two writes a few milliseconds apart) against a server in a SEPARATE process.
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const s = require('./support.cjs');
const h = require('./http.cjs');
const { startChild, pollState } = require('./child.cjs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const JSON_TYPE = { 'Content-Type': 'application/json' };
const json = (value) => JSON.stringify(value);
const chunk = (text) => `${Buffer.byteLength(text).toString(16)}\r\n${text}\r\n`;
let counter = 0;
const key = (prefix) => `pl-${prefix}-${String(++counter).padStart(6, '0')}`;

function frame(method, urlPath, version, { port, host, headers = {}, body, chunkedBody, noHost = false } = {}) {
  const head = [`${method} ${urlPath} HTTP/${version}`];
  if (!noHost) head.push(`Host: ${host || `127.0.0.1:${port}`}`);
  for (const [name, value] of Object.entries(headers)) head.push(`${name}: ${value}`);
  if (version === '1.0') head.push('Connection: keep-alive');
  let payload = '';
  if (chunkedBody !== undefined) { head.push('Transfer-Encoding: chunked'); payload = chunkedBody; } else if (body !== undefined) { head.push(`Content-Length: ${Buffer.byteLength(body)}`); payload = body; }
  return `${head.join('\r\n')}\r\n\r\n${payload}`;
}

// One exchange: every write in order (optionally with a pause), then read until the server closes the connection or until a SECOND answer shows that
// a later request was answered (already the failure, nothing more needs reading). No timer: a server that keeps the connection open is cut by the
// node:test timeout alone, and a healthy server on a saturated machine is never cut short (F25 of the third independent review).
function exchange(port, writes) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const parts = [];
    let finished = false;
    const text = () => Buffer.concat(parts).toString('latin1');
    const statuses = () => [...text().matchAll(/HTTP\/1\.[01] (\d{3})/g)].map((m) => Number(m[1]));
    const finish = () => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve({ text: text(), statuses: statuses() });
    };
    socket.on('data', (part) => { parts.push(part); if (statuses().length > 1) finish(); });
    socket.on('close', finish);
    socket.on('error', finish);
    socket.on('connect', async () => {
      for (const { bytes, pauseMs } of writes) {
        if (pauseMs) await sleep(pauseMs);
        if (!socket.destroyed) socket.write(bytes);
      }
    });
  });
}

const fileHash = (dir) => { try { return createHash('sha256').update(fs.readFileSync(path.join(dir, 'journal.jsonl'))).digest('hex'); } catch { return 'none'; } };

async function snapshot(ctx) {
  const state = (await h.get(ctx.origin, '/api/state')).json;
  return JSON.stringify({ hash: fileHash(ctx.dir), journalEntries: state.journalEntries, epoch: state.epoch, status: state.action ? state.action.status : null });
}

// Poll to quiescence (never one fixed sleep): the snapshot must stay identical for several consecutive polls. No deadline: with the signal of the
// test (ctx.signal) the wait ends with a named error when the test is aborted, without it only the runner's timeout ends it.
async function settled(ctx) {
  let last = await snapshot(ctx);
  let same = 0;
  while (same < 8) {
    await sleep(12);
    const now = await snapshot(ctx);
    if (now === last) same += 1; else { same = 0; last = now; }
    if (ctx.signal && ctx.signal.aborted) throw new Error('the server state never became quiet');
  }
  return last;
}

// Prepares ONE server process in the state the mutation needs: 'cancel' a live action held before step 3, 'reconcile' an action interrupted
// by a hard kill and restart, 'start' an empty journal.
async function prepare(t, type) {
  const made = s.scratch(`pl${type[0]}`);
  t.after(() => made.remove());
  const { signal } = t;
  const launch = (extra) => startChild(t, { args: [`--dir=${made.dir}`, '--step-delay-ms=0', ...extra] });
  let kid = launch(type === 'start' ? [] : ['--hold-before-step=3']);
  let origin = await kid.origin();
  let actionId = null;
  if (type !== 'start') {
    const started = await h.post(origin, '/api/start', s.startCmd(key('prep')));
    assert202(started);
    const state = await pollState(origin, (v) => v.action && v.action.effectsStanding.length === 2, 'two effects were never journaled', { signal });
    actionId = state.action.actionId;
    if (type === 'reconcile') {
      await kid.kill();
      kid = launch([]);
      origin = await kid.origin();
      actionId = (await pollState(origin, (v) => v.action && v.action.status === 'INTERRUPTED', 'the action was never interrupted by the restart', { signal })).action.actionId;
    }
  }
  return { type, kid, origin, port: Number(new URL(origin).port), dir: made.dir, actionId, signal };
}

function assert202(answer) { if (answer.status !== 202) throw new Error(`the preparing start was not accepted: ${answer.text}`); }

function mutation(ctx, version) {
  const { port } = ctx;
  if (ctx.type === 'start') return frame('POST', '/api/start', version, { port, headers: JSON_TYPE, body: json(s.startCmd(key('st'))) });
  if (ctx.type === 'cancel') return frame('POST', '/api/cancel', version, { port, headers: JSON_TYPE, body: json(s.cancelCmd(key('ca'), ctx.actionId, 1, false)) });
  return frame('POST', '/api/reconcile', version, { port, headers: JSON_TYPE, body: json(s.reconcileCmd(key('re'), ctx.actionId, 1)) });
}

const okGet = (ctx, version) => frame('GET', '/api/state', version, { port: ctx.port });
const id = (ctx) => ctx.actionId || 'act-1-00000001';
const cancelBody = (ctx, extra = {}) => json({ ...s.cancelCmd(key('xx'), id(ctx), 1, false), ...extra });

// [name, status of the refusal (null: any typed refusal), versions it can be framed in, build(ctx, version)]
const REFUSALS = [
  ['403 foreign Origin', 403, ['1.1', '1.0'], (c, v) => frame('POST', '/api/cancel', v, { port: c.port, headers: { ...JSON_TYPE, Origin: 'http://evil.example' }, body: cancelBody(c) })],
  ['403 cross-site GET', 403, ['1.1', '1.0'], (c, v) => frame('GET', '/api/state', v, { port: c.port, headers: { 'Sec-Fetch-Site': 'cross-site' } })],
  ['403 forged Host', 403, ['1.1', '1.0'], (c, v) => frame('POST', '/api/cancel', v, { host: 'evil.example', headers: JSON_TYPE, body: cancelBody(c) })],
  ['403 no Host (Node would answer 400 itself)', 403, ['1.1', '1.0'], (c, v) => frame('GET', '/api/state', v, { noHost: true })],
  ['404 unknown route', 404, ['1.1', '1.0'], (c, v) => frame('GET', '/nowhere', v, { port: c.port })],
  ['404 URL over 512 characters', 404, ['1.1', '1.0'], (c, v) => frame('GET', `/${'a'.repeat(600)}`, v, { port: c.port })],
  ['405 PUT on a command route', 405, ['1.1', '1.0'], (c, v) => frame('PUT', '/api/cancel', v, { port: c.port, headers: JSON_TYPE, body: cancelBody(c) })],
  ['405 GET on a command route', 405, ['1.1', '1.0'], (c, v) => frame('GET', '/api/cancel', v, { port: c.port })],
  ['405 POST to an unknown route', 405, ['1.1', '1.0'], (c, v) => frame('POST', '/nowhere', v, { port: c.port, headers: JSON_TYPE, body: '{}' })],
  ['413 declared length over the limit', 413, ['1.1', '1.0'], (c, v) => frame('POST', '/api/cancel', v, { port: c.port, headers: JSON_TYPE, body: json({ pad: 'a'.repeat(3000) }) })],
  ['413 chunked over the limit', 413, ['1.1'], (c, v) => frame('POST', '/api/cancel', v, { port: c.port, headers: JSON_TYPE, chunkedBody: `${'1\r\na\r\n'.repeat(2100)}0\r\n\r\n` })],
  ['415 text/plain', 415, ['1.1', '1.0'], (c, v) => frame('POST', '/api/cancel', v, { port: c.port, headers: { 'Content-Type': 'text/plain' }, body: 'hello' })],
  ['415 chunked text/plain', 415, ['1.1'], (c, v) => frame('POST', '/api/cancel', v, { port: c.port, headers: { 'Content-Type': 'text/plain' }, chunkedBody: `${chunk('hello')}0\r\n\r\n` })],
  ['417 unknown Expect', 417, ['1.1'], (c, v) => frame('POST', '/api/cancel', v, { port: c.port, headers: { ...JSON_TYPE, Expect: 'foo' }, body: cancelBody(c) })],
  ['415 Expect: 100-continue then text/plain', 415, ['1.1'], (c, v) => frame('POST', '/api/cancel', v, { port: c.port, headers: { 'Content-Type': 'text/plain', Expect: '100-continue' }, body: 'hello' })],
  ['400 INVALID_JSON (decided after an await)', 400, ['1.1', '1.0'], (c, v) => frame('POST', '/api/cancel', v, { port: c.port, headers: JSON_TYPE, body: '{"kind":' })],
  ['400 INVALID_JSON chunked (after an await)', 400, ['1.1'], (c, v) => frame('POST', '/api/cancel', v, { port: c.port, headers: JSON_TYPE, chunkedBody: `${chunk('{"kind":')}0\r\n\r\n` })],
  ['400 kind mismatch (after an await)', 400, ['1.1', '1.0'], (c, v) => frame('POST', '/api/cancel', v, { port: c.port, headers: JSON_TYPE, body: cancelBody(c, { kind: 'start' }) })],
  ['400 unknown field (after an await)', 400, ['1.1', '1.0'], (c, v) => frame('POST', '/api/cancel', v, { port: c.port, headers: JSON_TYPE, body: cancelBody(c, { extraField: 1 }) })],
  ['400 missing field (after an await)', 400, ['1.1', '1.0'], (c, v) => { const o = JSON.parse(cancelBody(c)); delete o.key; return frame('POST', '/api/cancel', v, { port: c.port, headers: JSON_TYPE, body: json(o) }); }],
  ['400 JSON null body (after an await)', 400, ['1.1', '1.0'], (c, v) => frame('POST', '/api/cancel', v, { port: c.port, headers: JSON_TYPE, body: 'null' })],
  ['engine refusal: cancel of an unknown action (after an await)', null, ['1.1', '1.0'], (c, v) => frame('POST', '/api/cancel', v, { port: c.port, headers: JSON_TYPE, body: json(s.cancelCmd(key('xx'), 'act-9-ffffffff', 1, false)) })],
  ['engine refusal: reconcile of an unknown action (after an await)', null, ['1.1', '1.0'], (c, v) => frame('POST', '/api/reconcile', v, { port: c.port, headers: JSON_TYPE, body: json(s.reconcileCmd(key('xx'), 'act-9-ffffffff', 1)) })],
  ['engine refusal: epoch start (after an await)', null, ['1.1', '1.0'], (c, v) => frame('POST', '/api/start', v, { port: c.port, headers: JSON_TYPE, body: json(s.startCmd(key('xx'), 7)) })],
];

module.exports = Object.freeze({ sleep, frame, exchange, snapshot, settled, prepare, mutation, okGet, REFUSALS });
