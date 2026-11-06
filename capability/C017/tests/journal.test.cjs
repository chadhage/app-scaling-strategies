'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = require('./support.cjs');
const J = require('../journal.cjs');

const entry = (n) => ({ type: 'boot', at: `2026-01-01T00:00:0${n}.000Z`, bootId: `0000000${n}` });
function written(t, count = 3) {
  const made = s.scratch('j');
  t.after(() => made.remove());
  const journal = J.openJournal(made.dir);
  journal.read();
  journal.append(Array.from({ length: count }, (_, i) => entry(i + 1)));
  return { made, file: journal.file, journal, lines: () => fs.readFileSync(journal.file, 'utf8').split('\n').slice(0, -1) };
}
const rewrite = (file, lines) => fs.writeFileSync(file, lines.length ? `${lines.join('\n')}\n` : '');
const readError = (dir) => { try { J.openJournal(dir).read(); return null; } catch (error) { return error; } };

test('a journal round-trips, chains every line to the previous digest and survives reopening', (t) => {
  const w = written(t);
  const again = J.openJournal(w.made.dir);
  assert.deepEqual(again.read(), [entry(1), entry(2), entry(3)]);
  const lines = w.lines().map((line) => JSON.parse(line));
  assert.deepEqual(lines.map((l) => l.seq), [1, 2, 3]);
  assert.equal(lines[0].prev, null);
  assert.equal(lines[1].prev, lines[0].entryDigest);
  assert.equal(lines[2].prev, lines[1].entryDigest);
  again.append([entry(4)]);
  assert.equal(J.openJournal(w.made.dir).read().length, 4);
  assert.equal(again.size(), fs.statSync(w.file).size);
});

test('a missing journal reads as empty and an empty text parses as no entries', (t) => {
  const made = s.scratch('j');
  t.after(() => made.remove());
  assert.deepEqual(J.openJournal(made.dir).read(), []);
  assert.deepEqual(J.parseLines(''), { entries: [], tail: { seq: 0, digest: null } });
});

const damage = [
  ['a flipped byte', (l) => { l[1] = l[1].replace('00000002', '00000009'); }, 'STATE_DIGEST'],
  ['a missing final newline', (l, f) => fs.writeFileSync(f, l.join('\n')), 'TORN_TAIL'],
  ['a half-written last line', (l, f) => fs.writeFileSync(f, `${l.slice(0, 2).join('\n')}\n${l[2].slice(0, 40)}`), 'TORN_TAIL'],
  ['swapped lines', (l) => { [l[0], l[1]] = [l[1], l[0]]; }, 'HISTORY_CHAIN'],
  ['a duplicated last line', (l) => l.push(l[2]), 'HISTORY_CHAIN'],
  ['a deleted first line', (l) => l.shift(), 'HISTORY_CHAIN'],
  ['an extra field', (l) => { l[1] = l[1].replace('{', '{"extra":1,'); }, 'CLOSED_SCHEMA'],
  ['a non-object line', (l) => { l[1] = '[1]'; }, 'CLOSED_SCHEMA'],
  ['another format version', (l) => { l[1] = l[1].replace('"formatVersion":1', '"formatVersion":2'); }, 'FILE_VERSION'],
  ['a non-JSON line', (l) => { l[1] = 'not json'; }, 'CORRUPT_JSON'],
  ['a fractional number', (l) => { const r = JSON.parse(l[0]); r.entry = { a: 1.5 }; l[0] = JSON.stringify(r); }, 'CORRUPT_JSON'],
];
for (const [name, mutate, code] of damage) {
  test(`damage is detected, never repaired: ${name} is ${code}`, (t) => {
    const w = written(t);
    const lines = w.lines();
    mutate(lines, w.file);
    if (!['TORN_TAIL'].includes(code)) rewrite(w.file, lines);
    const before = fs.readFileSync(w.file);
    const error = readError(w.made.dir);
    assert.ok(error instanceof J.JournalError, String(error));
    assert.equal(error.code, code);
    assert.deepEqual(fs.readFileSync(w.file), before, 'reading never writes');
  });
}

test('invalid UTF-8, a directory in place of the file and oversize are refused', (t) => {
  const w = written(t);
  fs.writeFileSync(w.file, Buffer.from([0xff, 0xfe, 0x0a]));
  assert.equal(readError(w.made.dir).code, 'INVALID_UTF8');
  fs.rmSync(w.file);
  fs.mkdirSync(w.file);
  assert.equal(readError(w.made.dir).code, 'UNSAFE_FILE');
  fs.rmdirSync(w.file);
  fs.writeFileSync(w.file, Buffer.alloc(J.MAX_BYTES + 1, 0x61));
  assert.equal(readError(w.made.dir).code, 'STATE_OVERSIZE');
});

test('an append that would exceed the size limit is refused before writing', (t) => {
  const w = written(t, 1);
  const before = fs.readFileSync(w.file);
  const huge = { type: 'boot', at: 'x', bootId: 'y'.repeat(80) };
  assert.throws(() => w.journal.append(Array.from({ length: 2000 }, () => huge)), (error) => error.code === 'STATE_OVERSIZE');
  assert.deepEqual(fs.readFileSync(w.file), before);
  w.journal.append([entry(2)]);
  assert.equal(J.openJournal(w.made.dir).read().length, 2);
});

test('a second writer is detected and a failed write leaves the journal broken, not guessed', (t) => {
  const w = written(t, 1);
  const other = J.openJournal(w.made.dir);
  other.read();
  other.append([entry(2)]);
  assert.throws(() => w.journal.append([entry(3)]), (error) => error.code === 'CONCURRENT_WRITER');
  assert.throws(() => w.journal.append([entry(3)]), (error) => error.code === 'WRITE_FAILED' && /earlier write failed/.test(error.message));
  assert.equal(J.openJournal(w.made.dir).read().length, 2);
});

test('write and flush failures surface as WRITE_FAILED and stop further appends', (t) => {
  for (const method of ['writeSync', 'fsyncSync']) {
    const w = written(t, 1);
    const mocked = t.mock.method(fs, method, () => { throw new Error('disk full'); });
    assert.throws(() => w.journal.append([entry(2)]), (error) => error.code === 'WRITE_FAILED');
    mocked.mock.restore();
    assert.throws(() => w.journal.append([entry(2)]), (error) => error.code === 'WRITE_FAILED');
  }
});

test('one flush per append and one write per batch', (t) => {
  const w = written(t, 1);
  const writes = t.mock.method(fs, 'writeSync');
  const syncs = t.mock.method(fs, 'fsyncSync');
  w.journal.append([entry(2), entry(3)]);
  assert.equal(writes.mock.callCount(), 1);
  assert.equal(syncs.mock.callCount(), 1);
});

test('bad directories and storage errors are typed', (t) => {
  for (const bad of ['', 5, null, 'a\0b']) assert.throws(() => J.openJournal(bad), (error) => error.code === 'UNSAFE_PATH');
  const w = written(t, 1);
  t.mock.method(fs, 'lstatSync', () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); });
  assert.equal(readError(w.made.dir).code, 'STORAGE_ERROR');
});

test('a consistent rewrite with a recomputed digest chain passes the chain check, which is why the grammar check also exists', (t) => {
  const w = written(t, 2);
  const forged = s.scratch('f');
  t.after(() => forged.remove());
  const copy = J.openJournal(forged.dir);
  copy.read();
  copy.append([entry(1), { ...entry(2), bootId: 'forged-id' }]);
  assert.equal(J.openJournal(forged.dir).read()[1].bootId, 'forged-id');
  assert.notDeepEqual(fs.readFileSync(copy.file), fs.readFileSync(w.file));
});
