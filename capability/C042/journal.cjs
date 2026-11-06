'use strict';

// A hash-chained, append-only JSON Lines journal over a tiny io object (file or memory). Each line carries the
// SHA-256 of the previous line, so a gap, an edit or a reordering is detected on replay. A torn final line (a write
// that never completed) is discarded; a damaged earlier line fails closed.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const contract = require('./contract.js');
const input = require('./input.cjs');

const FILE = 'journal.jsonl';
const GENESIS = '0'.repeat(64);
const MAX_BYTES = 4 * 1024 * 1024;
const SHAPES = Object.freeze({
  begin: ['seq', 'prev', 'type', 'key', 'inputSha256', 'input'],
  resume: ['seq', 'prev', 'type', 'key'],
  commit: ['seq', 'prev', 'type', 'key', 'leaseId', 'units', 'reservedAfter'],
  cancel: ['seq', 'prev', 'type', 'key'],
});

class JournalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'JournalError';
    this.code = code;
  }
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

function createMemoryIo() {
  let content = '';
  return {
    kind: 'memory',
    read: () => content,
    append(text) { content += text; },
    truncate(bytes) { content = Buffer.from(content).subarray(0, bytes).toString(); },
  };
}

function createFileIo(directory) {
  const file = path.join(directory, FILE);
  return {
    kind: 'file',
    read() {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return '';
        throw error;
      }
    },
    append(text) {
      fs.mkdirSync(directory, { recursive: true });
      const handle = fs.openSync(file, 'a');
      try {
        fs.writeSync(handle, text);
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
    },
    truncate(bytes) {
      const handle = fs.openSync(file, 'r+');
      try {
        fs.ftruncateSync(handle, bytes);
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
    },
  };
}

function recordProblem(record, expectedSeq, previous) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return 'not an object';
  const keys = SHAPES[record.type];
  if (!keys || Object.keys(record).length !== keys.length || !keys.every((name) => Object.hasOwn(record, name))) return 'unexpected shape';
  if (record.seq !== expectedSeq) return 'sequence gap';
  if (record.prev !== previous) return 'broken hash chain';
  if (typeof record.key !== 'string' || !contract.KEY_PATTERN.test(record.key)) return 'invalid key';
  if (record.type === 'begin') {
    const checked = input.validateInput(record.input);
    if (!checked.ok || checked.input.idempotencyKey !== record.key || input.digestInput(checked.input) !== record.inputSha256) return 'invalid input';
  }
  if (record.type === 'commit') {
    const capacity = Object.hasOwn(contract.LEASES, record.leaseId) ? contract.LEASES[record.leaseId] : 0;
    const ints = [record.units, record.reservedAfter].every((value) => Number.isSafeInteger(value) && value >= 1);
    if (!ints || record.units > contract.UNITS.max || record.reservedAfter < record.units || record.reservedAfter > capacity) return 'invalid commit';
  }
  return null;
}

function replay(io) {
  const text = io.read();
  if (text.length > MAX_BYTES) throw new JournalError('JOURNAL_CORRUPT', 'The journal exceeds its size bound.');
  const lines = text.split('\n');
  const tail = lines.pop();
  const records = [];
  let previous = GENESIS;
  let validBytes = 0;
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new JournalError('JOURNAL_CORRUPT', `Line ${records.length + 1} is not JSON.`);
    }
    const problem = recordProblem(record, records.length + 1, previous);
    if (problem) throw new JournalError('JOURNAL_CORRUPT', `Line ${records.length + 1}: ${problem}.`);
    records.push(record);
    previous = sha256(line);
    validBytes += Buffer.byteLength(line) + 1;
  }
  return { records, previous, validBytes, tornTailBytes: Buffer.byteLength(tail) };
}

function openJournal(io) {
  let state;
  try {
    state = replay(io);
    if (state.tornTailBytes > 0) io.truncate(state.validBytes);
  } catch (error) {
    if (error instanceof JournalError) throw error;
    throw new JournalError('JOURNAL_UNAVAILABLE', 'The journal could not be read.');
  }
  const records = [...state.records];
  let previous = state.previous;
  let broken = false;
  return {
    records,
    tornTailBytes: state.tornTailBytes,
    get broken() { return broken; },
    append(fields) {
      if (broken) throw new JournalError('JOURNAL_UNCERTAIN', 'An earlier write was not confirmed; reopen the journal first.');
      const record = { seq: records.length + 1, prev: previous, ...fields };
      const line = JSON.stringify(record);
      try {
        io.append(`${line}\n`);
      } catch {
        broken = true;
        throw new JournalError('JOURNAL_UNCERTAIN', 'The write could not be confirmed.');
      }
      previous = sha256(line);
      records.push(record);
      return record;
    },
  };
}

module.exports = Object.freeze({ FILE, GENESIS, JournalError, createFileIo, createMemoryIo, openJournal, sha256 });
