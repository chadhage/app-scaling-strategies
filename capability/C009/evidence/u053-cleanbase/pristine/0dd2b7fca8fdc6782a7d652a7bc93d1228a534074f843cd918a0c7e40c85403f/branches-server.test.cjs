'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { withApp, request, send, startApp } = require('./helpers.cjs');
const { rootDir } = require('./dom-stub.cjs');
const authz = require('../authz.cjs');
const { CommandError } = require('../handlers.cjs');
const { createQueue } = require('../queue.cjs');

const until = async (predicate) => {
  for (let attempt = 0; attempt < 400 && !predicate(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(predicate(), 'condition not reached');
};
const lab = (extra = {}) => ({ app: { commands: { 'lab.run': { roles: ['operator'] }, 'lab.two': { roles: ['operator'] } }, validateInput: () => ({ ok: true, value: {} }), ...extra } });

test('the page assets are served byte for byte with their content type under the strict policy', () => withApp({}, async (context) => {
  const expected = { '/': ['index.html', 'text/html; charset=utf-8'], '/page.js': ['page.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
  for (const [route, [file, type]] of Object.entries(expected)) {
    const answer = await request(context, { route });
    assert.equal(answer.status, 200);
    assert.equal(answer.headers['content-type'], type);
    assert.equal(answer.text, fs.readFileSync(path.join(rootDir, file), 'utf8'));
    assert.match(answer.headers['content-security-policy'], /script-src 'self'/);
    assert.equal((await request(context, { route: `${route}?x=1` })).json.error.code, 'QUERY_NOT_ALLOWED');
    assert.equal((await request(context, { method: 'HEAD', route })).status, 405);
  }
  assert.equal((await request(context, { route: '/index.html' })).status, 404);
}));

test('the queue runs tasks one at a time in order and a rejected task does not stall the next', async () => {
  const queue = createQueue();
  const events = [];
  const first = queue.run(async () => { events.push('a'); await new Promise((resolve) => setImmediate(resolve)); events.push('a-end'); });
  const failing = queue.run(async () => { events.push('b'); throw new Error('boom'); });
  const last = queue.run(async () => { events.push('c'); return 'done'; });
  assert.equal(queue.size(), 3);
  await first;
  await assert.rejects(failing, /boom/);
  assert.equal(await last, 'done');
  assert.deepEqual(events, ['a', 'a-end', 'b', 'c']);
  assert.equal(queue.size(), 0);
});

test('an oversized body is cut off at the drain cap, never runs, and leaves the server usable', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  const before = context.app.snapshot();
  const outcome = await send(context, 'pool.resize', operator, 'x'.repeat(200000)).then((answer) => answer.status, (error) => error.code);
  assert.ok([413, 'ECONNRESET', 'EPIPE'].includes(outcome), String(outcome));
  assert.deepEqual(context.app.snapshot(), before);
  assert.equal((await send(context, 'pool.resize', operator)).status, 200);
}));

test('a response that cannot be written is destroyed instead of crashing the process', async () => {
  const context = await startApp();
  try {
    let destroyed = false;
    const response = { writeHead() { throw new Error('socket gone'); }, end() {}, once() {}, destroy() { destroyed = true; } };
    const fake = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: `127.0.0.1:${context.port}` }, url: '/v1/state', method: 'GET', rawHeaders: [] };
    context.app.server.emit('request', fake, response);
    await until(() => destroyed);
  } finally {
    await context.close();
  }
});

test('decide reads a null table entry as no roles and an unknown authentication code is refused', () => {
  const decision = authz.decide({ lab: null }, 'lab', 'operator');
  assert.deepEqual([decision.allowed, decision.code, decision.requiredRoles], [false, 'ROLE_FORBIDDEN', []]);
  assert.throws(() => new authz.AuthError('SOMETHING_ELSE'), { name: 'RangeError' });
});

test('a permitted command without a handler is a typed 501 and has no effect', () => withApp(lab({ handlers: {} }), async (context) => {
  const before = context.app.snapshot();
  const answer = await send(context, 'lab.run', context.app.issueToken('operator'), {});
  assert.deepEqual([answer.status, answer.json.error.code], [501, 'COMMAND_NOT_IMPLEMENTED']);
  assert.deepEqual(context.app.snapshot(), before);
}));

test('a handler failure with an unlisted code is a generic COMMAND_FAILED, a listed code keeps its status', () => withApp(lab({
  handlers: { 'lab.run'() { throw new CommandError(418, 'TEAPOT'); }, 'lab.two'() { throw new CommandError(409, 'ALREADY_APPROVED'); } }
}), async (context) => {
  const operator = context.app.issueToken('operator');
  const before = context.app.snapshot();
  const generic = await send(context, 'lab.run', operator, {});
  assert.deepEqual([generic.status, generic.json.error.code], [500, 'COMMAND_FAILED']);
  assert.equal(generic.text.includes('TEAPOT'), false);
  const listed = await send(context, 'lab.two', operator, {});
  assert.deepEqual([listed.status, listed.json.error.code], [409, 'ALREADY_APPROVED']);
  assert.deepEqual(context.app.snapshot(), before);
  assert.deepEqual(context.app.auditLog().map((entry) => entry.outcome), ['failed', 'rejected']);
}));

test('the permission is decided again at commit: a table change while queued denies the later command', async () => {
  const table = { 'lab.run': { roles: ['operator'] }, 'lab.slow': { roles: ['operator'] } };
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let entered = false;
  const hooks = { async beforeCommit({ command }) { if (command === 'lab.slow') { entered = true; await gate; table['lab.run'] = { roles: [] }; } } };
  await withApp({ app: { commands: table, hooks, handlers: { 'lab.slow': () => ({}), 'lab.run': () => ({}) }, validateInput: () => ({ ok: true, value: {} }) } }, async (context) => {
    const operator = context.app.issueToken('operator');
    const slow = send(context, 'lab.slow', operator, {});
    await until(() => entered);
    const late = send(context, 'lab.run', operator, {});
    await until(() => context.app.queued() === 2);
    release();
    const [done, denied] = await Promise.all([slow, late]);
    assert.equal(done.status, 200);
    assert.deepEqual([denied.status, denied.json.error.code, denied.json.requiredRoles], [403, 'ROLE_FORBIDDEN', []]);
    assert.equal(context.app.snapshot().revision, 1);
    assert.deepEqual(context.app.auditLog().map((entry) => entry.outcome), ['applied', 'denied']);
  });
});

test('input refusals name only server-known fields and never echo a field the client invented', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  const cases = [[{ size: 3, zzz: 1 }, 'INPUT_UNKNOWN_FIELD', undefined], [{ size: '3' }, 'INPUT_INVALID', 'size'], [{}, 'INPUT_MISSING_FIELD', 'size'],
    [{ size: 3, role: 'x' }, 'IDENTITY_CLAIM_REJECTED', 'role'], [[], 'BODY_NOT_OBJECT', undefined]];
  for (const [body, code, field] of cases) {
    const answer = await send(context, 'pool.resize', operator, body);
    assert.equal(answer.json.error.code, code);
    assert.equal(answer.json.field, field, code);
  }
}));
