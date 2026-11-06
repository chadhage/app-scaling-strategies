'use strict';

// Original behavioral RED for C044. It loads the retained naive stubs next to it, never the production files,
// so it can be replayed at any time: node --test capability\C044\evidence\red\stream.initial.cjs  (exit 1).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const stub = require('./server.initial.cjs');
const reducer = require('./reducer.initial.js');

const context = Object.freeze({ runId: 'synthetic-run-001', epoch: 3, stateSha256: '0'.repeat(64) });
const idOf = (seq, run = context.runId, epoch = context.epoch) => `${run}:${epoch}:${seq}`;
const scratchRoot = path.join(__dirname, '..', '..', 'tests', 'scratch');

function manualScheduler() {
  let now = 0;
  const jobs = [];
  return {
    every(ms, fn) {
      const job = { ms, fn, next: now + ms, active: true };
      jobs.push(job);
      return () => { job.active = false; };
    },
    advance(delta) {
      const end = now + delta;
      for (;;) {
        const due = jobs.filter((job) => job.active && job.next <= end).sort((a, b) => a.next - b.next)[0];
        if (!due) break;
        now = due.next;
        due.next += due.ms;
        due.fn();
      }
      now = end;
    },
  };
}

async function listen(options = {}) {
  const scheduler = manualScheduler();
  const run = stub.createRun({ context, scheduler, totalSteps: 50, replayWindow: 4, ...options });
  const server = stub.createLocalServer({ run, scheduler });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { run, server, scheduler, origin: `http://127.0.0.1:${server.address().port}` };
}

async function shutdown(host) {
  host.server.closeAllConnections();
  await new Promise((resolve) => host.server.close(resolve));
}

function connect(origin, route, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(`${origin}${route}`, { headers, agent: false }, (response) => {
      const events = [];
      let buffer = '';
      let text = '';
      let notify = () => {};
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        text += chunk;
        buffer += chunk;
        for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
          const lines = buffer.slice(0, end).split('\n');
          buffer = buffer.slice(end + 2);
          const fields = Object.fromEntries(lines.filter((line) => !line.startsWith(':') && line.includes(': '))
            .map((line) => [line.slice(0, line.indexOf(': ')), line.slice(line.indexOf(': ') + 2)]));
          if (fields.event) events.push({ id: fields.id, event: fields.event, data: JSON.parse(fields.data) });
        }
        notify();
      });
      response.on('end', () => notify());
      resolve({
        status: response.statusCode,
        events,
        text: () => text,
        destroy: () => { request.destroy(); response.destroy(); },
        async waitForEvents(count, limitMs = 2000) {
          const deadline = Date.now() + limitMs;
          while (events.length < count && Date.now() < deadline) {
            await new Promise((done) => { notify = done; setTimeout(done, 50); });
          }
          return events;
        },
        async failure() {
          while (!response.complete && !response.destroyed) await new Promise((done) => { notify = done; setTimeout(done, 25); });
          return JSON.parse(text);
        },
      });
    });
    request.on('error', reject);
  });
}

async function settle(until) {
  for (let turn = 0; turn < 2000 && !until(); turn++) await new Promise((resolve) => setImmediate(resolve));
}

test('a reconnect with Last-Event-ID resumes at the next event and never re-sends acknowledged events', async () => {
  const host = await listen();
  try {
    for (let step = 0; step < 10; step++) host.run.produce();
    const client = await connect(host.origin, '/stream', { 'Last-Event-ID': idOf(5) });
    await client.waitForEvents(5);
    assert.equal(client.status, 200);
    assert.deepEqual(client.events.slice(0, 5).map((event) => event.id), [6, 7, 8, 9, 10].map((seq) => idOf(seq)),
      'resume must start at the next event: no event up to the cursor may be sent again');
    client.destroy();
  } finally {
    await shutdown(host);
  }
});

test('an abrupt client disconnect never cancels the run: its own counters keep advancing while detached', async () => {
  const host = await listen();
  try {
    const client = await connect(host.origin, '/stream');
    host.scheduler.advance(3000);
    await client.waitForEvents(3);
    client.destroy();
    await settle(() => host.run.counters.clientsAttached === 0);
    const before = host.run.counters.produced;
    host.scheduler.advance(5000);
    assert.equal(host.run.counters.produced - before, 5, 'the producer must keep going while no client is attached');
  } finally {
    await shutdown(host);
  }
});

test('a cursor older than the replay window is a typed CURSOR_EXPIRED failure, not a restarted stream', async () => {
  const host = await listen();
  try {
    for (let step = 0; step < 10; step++) host.run.produce();
    const client = await connect(host.origin, '/stream', { 'Last-Event-ID': idOf(2) });
    assert.equal(client.status, 410, 'a stale cursor must be answered with an explicit typed failure');
    const body = await client.failure();
    assert.equal(body.error.code, 'CURSOR_EXPIRED');
    assert.ok(body.allowedActions.some((item) => item.action === 'resync-from-snapshot'));
    client.destroy();
  } finally {
    await shutdown(host);
  }
});

for (const [name, cursor, status, code] of [
  ['beyond the head of the run', idOf(99), 409, 'CURSOR_FROM_FUTURE'],
  ['attributed to another run', idOf(3, 'synthetic-run-002'), 409, 'CURSOR_RUN_MISMATCH'],
  ['attributed to another epoch', idOf(3, context.runId, 2), 409, 'CURSOR_EPOCH_MISMATCH'],
  ['malformed', 'not-a-cursor', 400, 'CURSOR_MALFORMED'],
]) {
  test(`a cursor ${name} is the typed failure ${code}`, async () => {
    const host = await listen();
    try {
      for (let step = 0; step < 6; step++) host.run.produce();
      const client = await connect(host.origin, '/stream', { 'Last-Event-ID': cursor });
      assert.equal(client.status, status, 'the stream must not open for a cursor that cannot be honoured');
      const body = await client.failure();
      assert.equal(body.error.code, code);
      assert.ok(Array.isArray(body.allowedActions) && body.allowedActions.length > 0);
      client.destroy();
    } finally {
      await shutdown(host);
    }
  });
}

test('the client reducer drops a duplicate delivery by id and counts it instead of showing a new event', () => {
  let state = reducer.initial();
  const delivery = { type: 'event', id: idOf(1), event: 'run-started', data: { runId: context.runId, epoch: 3, seq: 1 } };
  state = reducer.reduce(state, delivery);
  state = reducer.reduce(state, delivery);
  assert.equal(state.events.length, 1, 'a duplicate delivery must not become a second event');
  assert.equal(state.counts.duplicates, 1, 'the dropped duplicate must be counted');
});

test('a restarted server restores the run and its event log from persisted state', async () => {
  const persistDir = path.join(scratchRoot, `red-${randomUUID()}`);
  fs.mkdirSync(persistDir, { recursive: true });
  try {
    const first = await listen({ persistDir });
    for (let step = 0; step < 7; step++) first.run.produce();
    await shutdown(first);
    const second = await listen({ persistDir });
    try {
      assert.equal(second.run.snapshot().headSeq, 7, 'an acknowledged event must never disappear across a restart');
    } finally {
      await shutdown(second);
    }
  } finally {
    fs.rmSync(persistDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
