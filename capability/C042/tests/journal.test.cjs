'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const input = require('../input.cjs');
const journal = require('../journal.cjs');
const { cleanup, scratch, valid } = require('./support.cjs');

const entry = (overrides = {}) => {
  const checked = input.validateInput(valid(overrides)).input;
  return { type: 'begin', key: checked.idempotencyKey, inputSha256: input.digestInput(checked), input: checked };
};
const commit = (overrides = {}) => ({ type: 'commit', key: 'key-0001-aaaa', leaseId: 'synthetic-lease-001', units: 5, reservedAfter: 5, ...overrides });
const lines = (io) => io.read().split('\n').filter(Boolean);
const withLines = (rows) => { const io = journal.createMemoryIo(); io.append(`${rows.join('\n')}\n`); return io; };
const corrupt = (io) => { try { journal.openJournal(io); } catch (error) { return error; } return null; };

function written() {
  const io = journal.createMemoryIo();
  const opened = journal.openJournal(io);
  opened.append(entry());
  opened.append(commit());
  opened.append(entry({ idempotencyKey: 'key-0002-bbbb', units: 2 }));
  return io;
}

test('records form a hash chain that replays identically', () => {
  const io = written();
  const reopened = journal.openJournal(io);
  assert.deepEqual(reopened.records.map((record) => [record.seq, record.type]), [[1, 'begin'], [2, 'commit'], [3, 'begin']]);
  assert.equal(reopened.records[0].prev, journal.GENESIS);
  assert.equal(reopened.records[1].prev, journal.sha256(lines(io)[0]));
  assert.equal(reopened.tornTailBytes, 0);
  assert.equal(reopened.append({ type: 'cancel', key: 'key-0002-bbbb' }).seq, 4);
  assert.equal(journal.openJournal(io).records.length, 4);
});

test('every edit, gap, reorder and invalid record fails closed', () => {
  const rows = lines(written());
  const cases = [
    ['a line edited in place', [rows[0], rows[1].replace('"units":5', '"units":4'), rows[2]]],
    ['a deleted line', [rows[0], rows[2]]],
    ['swapped lines', [rows[1], rows[0], rows[2]]],
    ['a duplicated line', [rows[0], rows[0], rows[1]]],
    ['a line that is not JSON', [rows[0], '{broken', rows[2]]],
    ['a JSON line that is not an object', [rows[0], '7']],
    ['an unknown record type', [JSON.stringify({ ...JSON.parse(rows[0]), type: 'undo' })]],
    ['an extra property', [JSON.stringify({ ...JSON.parse(rows[0]), extra: 1 })]],
    ['a missing property', [JSON.stringify({ seq: 1, prev: journal.GENESIS, type: 'cancel' })]],
  ];
  for (const [name, set] of cases) {
    const error = corrupt(withLines(set));
    assert.equal(error?.code, 'JOURNAL_CORRUPT', name);
  }
});

test('records that break the closed shapes are refused even with a valid chain', () => {
  const bad = [
    ['a begin whose digest is wrong', { ...entry(), inputSha256: 'a'.repeat(64) }],
    ['a begin with an invalid input', { ...entry(), input: { ...entry().input, units: 99 } }],
    ['a begin whose key differs from its input', { ...entry(), key: 'key-9999-zzzz' }],
    ['a key that is not a key', { type: 'cancel', key: 'x' }],
    ['a commit with a non-integer unit count', commit({ units: 1.5 })],
    ['a commit with units beyond the maximum', commit({ units: 11, reservedAfter: 11 })],
    ['a commit with a total below its units', commit({ reservedAfter: 4 })],
    ['a commit above the capacity', commit({ leaseId: 'synthetic-lease-002', units: 5, reservedAfter: 11 })],
    ['a commit on an unknown lease', commit({ leaseId: 'toString' })],
    ['a commit with a non-key key', commit({ key: 5 })],
  ];
  for (const [name, record] of bad) {
    const io = journal.createMemoryIo();
    const row = { seq: 1, prev: journal.GENESIS, ...record };
    io.append(`${JSON.stringify(row)}\n`);
    assert.equal(corrupt(io)?.code, 'JOURNAL_CORRUPT', name);
  }
});

test('a torn final line is discarded and truncated, and later writes continue the chain', () => {
  const io = written();
  const whole = io.read();
  const complete = `${JSON.stringify({ seq: 4, prev: journal.sha256(lines(io)[2]), type: 'cancel', key: 'key-0002-bbbb' })}`;
  for (const tail of ['{"seq":4,"pre', complete, 'x']) {
    const torn = journal.createMemoryIo();
    torn.append(`${whole}${tail}`);
    const opened = journal.openJournal(torn);
    assert.equal(opened.records.length, 3, tail);
    assert.equal(opened.tornTailBytes, Buffer.byteLength(tail));
    assert.equal(torn.read(), whole, 'the file is truncated back to the last complete line');
    assert.equal(opened.append({ type: 'cancel', key: 'key-0002-bbbb' }).seq, 4);
    assert.equal(journal.openJournal(torn).records.length, 4);
  }
});

test('io failures are typed: unreadable, untruncatable, oversized, and unconfirmed writes', () => {
  const unreadable = { read() { throw new Error('EIO'); }, append() {}, truncate() {} };
  assert.equal(corrupt(unreadable)?.code, 'JOURNAL_UNAVAILABLE');
  const stuck = journal.createMemoryIo();
  stuck.append('{"seq":1');
  assert.equal(corrupt({ ...stuck, truncate() { throw new Error('EIO'); } })?.code, 'JOURNAL_UNAVAILABLE');
  assert.equal(corrupt({ read: () => ' '.repeat(4 * 1024 * 1024 + 1), append() {}, truncate() {} })?.code, 'JOURNAL_CORRUPT');
  let fail = false;
  const inner = journal.createMemoryIo();
  const opened = journal.openJournal({ ...inner, append(text) { if (fail) throw new Error('EIO'); inner.append(text); } });
  opened.append(entry());
  fail = true;
  assert.throws(() => opened.append(commit()), (error) => error instanceof journal.JournalError && error.code === 'JOURNAL_UNCERTAIN');
  assert.equal(opened.records.length, 1, 'an unconfirmed write is not remembered');
  assert.equal(opened.broken, true);
  fail = false;
  assert.throws(() => opened.append(commit()), /earlier write was not confirmed/);
});

test('the file io appends durably, creates its directory, truncates and reads a missing file as empty', () => {
  const dir = path.join(scratch(), 'nested', 'dir');
  try {
    const io = journal.createFileIo(dir);
    assert.equal(io.kind, 'file');
    assert.equal(io.read(), '');
    const opened = journal.openJournal(io);
    opened.append(entry());
    opened.append(commit());
    assert.equal(fs.readFileSync(path.join(dir, 'journal.jsonl'), 'utf8').split('\n').length, 3);
    fs.appendFileSync(path.join(dir, 'journal.jsonl'), '{"seq":3,"pr');
    const reopened = journal.openJournal(journal.createFileIo(dir));
    assert.deepEqual([reopened.records.length, reopened.tornTailBytes], [2, 12]);
    assert.equal(fs.readFileSync(path.join(dir, 'journal.jsonl'), 'utf8').endsWith('}\n'), true);
    assert.equal(journal.createMemoryIo().kind, 'memory');
    const broken = path.join(dir, 'blocked');
    fs.writeFileSync(broken, 'x');
    assert.throws(() => journal.createFileIo(broken).append('x'));
    assert.throws(() => journal.createFileIo(path.join(dir, 'missing')).truncate(0));
  } finally {
    cleanup(path.resolve(dir, '..', '..'));
  }
});
