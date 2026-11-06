'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const journal = require('../journal.cjs');
const { openEngine } = require('../engine.cjs');
const { call, cleanup, deferred, gate, inFlight, journalLines, lease, scratch, startService, types, valid } = require('./support.cjs');

test('parallel clients with different keys each get one effect and the journal stays a valid chain', async () => {
  const service = await startService();
  try {
    const keys = Array.from({ length: 24 }, (_, index) => ({ key: `key-${String(index).padStart(4, '0')}-par`, units: (index % 4) + 1 }));
    const answers = await Promise.all(keys.map(({ key, units }) => call(service.port, 'POST', '/v1/steps', valid({ idempotencyKey: key, units }))));
    assert.deepEqual(answers.map((answer) => answer.status), Array(24).fill(201));
    const totals = answers.map((answer) => answer.json.effect.reservedAfter).sort((a, b) => a - b);
    assert.equal(new Set(totals).size, 24, 'every commit saw a different running total');
    assert.equal(totals.at(-1), keys.reduce((sum, item) => sum + item.units, 0));
    assert.equal((await lease(service.port)).committed, 60);
    const reopened = journal.openJournal(journal.createFileIo(service.dir));
    assert.deepEqual([reopened.records.filter((r) => r.type === 'begin').length, reopened.records.filter((r) => r.type === 'commit').length], [24, 24]);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('a storm of duplicate submissions produces one effect per key', async () => {
  const service = await startService();
  try {
    const keys = Array.from({ length: 6 }, (_, index) => `key-${index}-storm-aa`);
    const requests = keys.flatMap((key) => Array.from({ length: 8 }, () => call(service.port, 'POST', '/v1/steps', valid({ idempotencyKey: key, units: 2 }))));
    const answers = await Promise.all(requests);
    for (const key of keys) {
      const mine = answers.filter((answer) => answer.json.idempotencyKey === key);
      assert.deepEqual([mine.filter((a) => a.status === 201).length, mine.filter((a) => a.status === 200).length], [1, 7], key);
      assert.equal(mine.filter((a) => a.json.effect.appliedByThisRequest).length, 1, key);
      assert.equal(new Set(mine.map((a) => a.json.effect.reservedAfter)).size, 1, 'every duplicate reports the same recorded total');
    }
    assert.equal((await lease(service.port)).committed, 12);
    assert.deepEqual([types(service.dir).filter((t) => t === 'begin').length, types(service.dir).filter((t) => t === 'commit').length], [6, 6]);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('parallel steps cannot oversubscribe a lease: held units count and the rest are rejected', async () => {
  const held = gate();
  const service = await startService({ executor: held.executor });
  try {
    const keys = Array.from({ length: 6 }, (_, index) => `key-${index}-over-aa`);
    const pending = [];
    for (const key of keys) {
      pending.push(call(service.port, 'POST', '/v1/steps', valid({ idempotencyKey: key, leaseId: 'synthetic-lease-002', units: 3 })));
      await Promise.race([held.entered(key), pending.at(-1)]);
    }
    assert.deepEqual((await lease(service.port, 'synthetic-lease-002')), { capacity: 10, committed: 0, held: 9, available: 1 });
    for (const key of keys) held.release(key);
    const answers = await Promise.all(pending);
    assert.deepEqual(answers.map((answer) => answer.status), [201, 201, 201, 409, 409, 409]);
    assert.deepEqual(answers.slice(3).map((answer) => answer.json.error.code), Array(3).fill('CAPACITY_EXHAUSTED'));
    assert.deepEqual((await lease(service.port, 'synthetic-lease-002')), { capacity: 10, committed: 9, held: 0, available: 1 });
    assert.deepEqual(types(service.dir), ['begin', 'begin', 'begin', 'commit', 'commit', 'commit']);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});

test('state survives restarts through the file journal, and a torn tail is discarded without an effect', async () => {
  const dir = scratch();
  const held = gate();
  const KEY2 = 'key-0002-bbbb';
  let service = await startService({ dir, executor: held.executor });
  try {
    held.release(valid().idempotencyKey);
    assert.equal((await call(service.port, 'POST', '/v1/steps', valid())).status, 201);
    const pending = call(service.port, 'POST', '/v1/steps', valid({ idempotencyKey: KEY2, units: 2 }));
    pending.catch(() => {});
    await inFlight(held, KEY2, [pending]);
    await service.stop();
    const junk = '{"seq":4,"prev":"abc';
    fs.appendFileSync(path.join(dir, journal.FILE), junk);
    service = await startService({ dir });
    assert.equal(service.engine.tornTailBytes, junk.length);
    assert.equal(fs.readFileSync(path.join(dir, journal.FILE), 'utf8').endsWith('}\n'), true);
    const replay = await call(service.port, 'POST', '/v1/steps', valid());
    assert.deepEqual([replay.status, replay.json.replayed, replay.json.effect.reservedAfter], [200, true, 5]);
    const interrupted = await call(service.port, 'GET', `/v1/steps/${KEY2}`);
    assert.deepEqual([interrupted.json.outcome, interrupted.json.effect.applied], ['interrupted', false]);
    assert.deepEqual(await lease(service.port), { capacity: 100, committed: 5, held: 0, available: 95 });
    assert.equal((await call(service.port, 'POST', `/v1/steps/${KEY2}/resume`)).json.outcome, 'succeeded');
    await service.stop();
    service = await startService({ dir });
    assert.deepEqual(await lease(service.port), { capacity: 100, committed: 7, held: 0, available: 93 });
    assert.deepEqual((await call(service.port, 'POST', '/v1/steps', valid({ idempotencyKey: KEY2, units: 2 }))).json.trail.map((item) => item.type), ['begin', 'resume', 'commit']);
    assert.deepEqual(types(dir), ['begin', 'commit', 'begin', 'resume', 'commit']);
    assert.equal(journalLines(dir).every((record, index, all) => record.seq === index + 1 && (index === 0 || record.prev === journal.sha256(JSON.stringify(all[index - 1])))), true);
  } finally {
    await service.stop();
    cleanup(dir);
  }
});

test('a damaged journal stops the service from starting instead of guessing', async () => {
  const dir = scratch();
  try {
    const first = await startService({ dir });
    await call(first.port, 'POST', '/v1/steps', valid());
    await call(first.port, 'POST', '/v1/steps', valid({ idempotencyKey: 'key-0002-bbbb' }));
    await first.stop();
    const file = path.join(dir, journal.FILE);
    const original = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, original.replace('"units":5', '"units":4'));
    await assert.rejects(startService({ dir }), (error) => error.code === 'JOURNAL_CORRUPT');
    fs.writeFileSync(file, original.split('\n').filter((line, index) => index !== 1).join('\n'));
    await assert.rejects(openEngine({ io: journal.createFileIo(dir) }), (error) => error.code === 'JOURNAL_CORRUPT');
  } finally {
    cleanup(dir);
  }
});

test('a client that disappears while the response is pending cannot cancel or duplicate the step', async () => {
  const held = gate();
  const service = await startService({ executor: held.executor });
  try {
    const done = deferred();
    const net = require('node:net');
    const body = JSON.stringify(valid());
    const socket = net.connect({ host: '127.0.0.1', port: service.port }, () => {
      socket.write(`POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${service.port}\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body}`);
    });
    socket.on('error', () => {});
    socket.on('close', () => done.resolve());
    await held.entered(valid().idempotencyKey);
    socket.destroy();
    await done.promise;
    assert.equal((await lease(service.port)).held, 5, 'the step is still in flight');
    held.release(valid().idempotencyKey);
    const retry = await call(service.port, 'POST', '/v1/steps', valid());
    assert.deepEqual([retry.status, retry.json.outcome, retry.json.effect.reservedAfter], [200, 'succeeded', 5]);
    assert.deepEqual(types(service.dir), ['begin', 'commit']);
  } finally {
    await service.stop();
    cleanup(service.dir);
  }
});
