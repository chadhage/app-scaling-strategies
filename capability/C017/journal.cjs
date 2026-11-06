'use strict';

// Append-only, hash-chained, versioned journal on the local filesystem (the persisted-state pattern of the accepted C015:
// closed format version, previous-digest chain, canonical SHA-256 from C015's contract). Every append is flushed.
// Nothing here repairs, truncates or rewrites: any irregularity makes the journal unreadable, never "empty".
const fs = require('node:fs');
const path = require('node:path');
const { digest } = require('../C015/contract.cjs');

const FILE = 'journal.jsonl';
const MAX_BYTES = 262144;
const FORMAT_VERSION = 1;

class JournalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'JournalError';
    this.code = code;
  }
}

const lineKeys = ['entry', 'entryDigest', 'formatVersion', 'prev', 'seq'].join();

function parseLines(text) {
  if (text.length === 0) return { entries: [], tail: { seq: 0, digest: null } };
  if (!text.endsWith('\n')) throw new JournalError('TORN_TAIL', 'The journal does not end with a complete line; the last append is unconfirmed.');
  const entries = [];
  let prev = null;
  text.slice(0, -1).split('\n').forEach((line, index) => {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new JournalError('CORRUPT_JSON', `Journal line ${index + 1} is not JSON.`);
    }
    if (!record || typeof record !== 'object' || Array.isArray(record) || Object.keys(record).sort().join() !== lineKeys) {
      throw new JournalError('CLOSED_SCHEMA', `Journal line ${index + 1} does not have exactly the closed fields.`);
    }
    if (record.formatVersion !== FORMAT_VERSION) throw new JournalError('FILE_VERSION', `Journal line ${index + 1} has an unknown format version.`);
    if (record.seq !== index + 1 || record.prev !== prev) throw new JournalError('HISTORY_CHAIN', `Journal line ${index + 1} breaks the sequence or the previous-digest chain.`);
    let expected;
    try {
      expected = digest({ formatVersion: record.formatVersion, seq: record.seq, prev: record.prev, entry: record.entry });
    } catch {
      throw new JournalError('CORRUPT_JSON', `Journal line ${index + 1} is not closed JSON data.`);
    }
    if (expected !== record.entryDigest) throw new JournalError('STATE_DIGEST', `Journal line ${index + 1} does not match its digest.`);
    prev = record.entryDigest;
    entries.push(record.entry);
  });
  return { entries, tail: { seq: entries.length, digest: prev } };
}

function openJournal(dir) {
  if (typeof dir !== 'string' || dir.length === 0 || dir.includes('\0')) throw new JournalError('UNSAFE_PATH', 'A journal directory path is required.');
  const folder = path.resolve(dir);
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, FILE);
  let tail = { seq: 0, digest: null };
  let size = 0;
  let broken = false;

  function read() {
    let stat;
    try {
      stat = fs.lstatSync(file);
    } catch (error) {
      if (error.code === 'ENOENT') {
        tail = { seq: 0, digest: null };
        size = 0;
        return [];
      }
      throw new JournalError('STORAGE_ERROR', 'The journal cannot be inspected.');
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new JournalError('UNSAFE_FILE', 'The journal must be a regular file.');
    if (stat.size > MAX_BYTES) throw new JournalError('STATE_OVERSIZE', 'The journal exceeds its local size limit.');
    const bytes = fs.readFileSync(file);
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new JournalError('INVALID_UTF8', 'The journal is not valid UTF-8.');
    }
    const parsed = parseLines(text);
    tail = parsed.tail;
    size = bytes.length;
    return parsed.entries;
  }

  function append(batch) {
    if (broken) throw new JournalError('WRITE_FAILED', 'An earlier write failed; the journal is not appended to again.');
    let seq = tail.seq;
    let prev = tail.digest;
    const lines = batch.map((entry) => {
      seq += 1;
      const entryDigest = digest({ formatVersion: FORMAT_VERSION, seq, prev, entry });
      const line = `${JSON.stringify({ formatVersion: FORMAT_VERSION, seq, prev, entry, entryDigest })}\n`;
      prev = entryDigest;
      return line;
    });
    const bytes = Buffer.from(lines.join(''), 'utf8');
    if (size + bytes.length > MAX_BYTES) throw new JournalError('STATE_OVERSIZE', 'The journal would exceed its local size limit.');
    try {
      const current = fs.existsSync(file) ? fs.statSync(file).size : 0;
      if (current !== size) throw new JournalError('CONCURRENT_WRITER', 'The journal changed outside this process.');
      const fd = fs.openSync(file, 'a');
      try {
        fs.writeSync(fd, bytes);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } catch (error) {
      broken = true;
      throw error instanceof JournalError ? error : new JournalError('WRITE_FAILED', 'The journal write failed; its state is unknown.');
    }
    tail = { seq, digest: prev };
    size += bytes.length;
  }

  return Object.freeze({ file, read, append, size: () => size });
}

module.exports = Object.freeze({ FILE, MAX_BYTES, FORMAT_VERSION, JournalError, openJournal, parseLines });
