'use strict';

// Persisted versioned run/epoch event log in the C015 discipline: closed schema, canonical JSON, SHA-256 chain,
// exclusive creation, fsync of regular files, immutable earlier epochs, fail closed on anything unexpected.
// C015's contract primitives are imported unchanged (see imports.json); C015's closed run/epoch state anchors the header.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { canonical, digest, closed, parseStored, fail, FixtureError } = require('../C015/contract.cjs');

const namespaceRoot = path.resolve(__dirname);
const FORMAT_VERSION = 1;
const KIND = 'C044-run-epoch-log';
const maxLineBytes = 8192;
const maxLogBytes = 8 * 1024 * 1024;
const epochDirectory = /^epoch-(\d{3})$/;
const pendingDirectory = /^epoch-\d{3}\.pending-/;
const runIdPattern = /^synthetic-run-\d{3}$/;
const hexDigest = /^[0-9a-f]{64}$/;

function storageFailure(error) {
  if (error instanceof FixtureError) return error;
  return new FixtureError('STORAGE_ERROR', `Local filesystem operation failed (${error.code || 'UNKNOWN'}); nothing was acknowledged.`, [
    { code: error.code || 'UNKNOWN' },
  ]);
}

function within(base, target) {
  const relative = path.relative(base, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function ensureSafe(target, kind) {
  const resolved = path.resolve(target);
  if (resolved === namespaceRoot || !within(namespaceRoot, resolved)) {
    fail('PATH_SCOPE', 'Persisted C044 state must live beneath the owned C044 namespace.');
  }
  let current = namespaceRoot;
  for (const piece of path.relative(namespaceRoot, resolved).split(path.sep)) {
    current = path.join(current, piece);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (stat.isSymbolicLink() || path.relative(current, fs.realpathSync(current)) !== '') {
      fail('UNSAFE_PATH', 'Symlinks and junctions are forbidden in persisted state paths.');
    }
    if (current !== resolved) {
      if (!stat.isDirectory()) fail('UNSAFE_PATH', 'A persisted state ancestor is not a directory.');
    } else {
      if (kind === 'directory' && !stat.isDirectory()) fail('UNSAFE_PATH', 'Expected a real directory.');
      if (kind === 'file' && (!stat.isFile() || stat.nlink !== 1)) fail('UNSAFE_FILE', 'Expected a regular, non-hard-linked file.');
      return stat;
    }
  }
  return null;
}

function validateContext(context) {
  const ok = context && typeof context === 'object' && runIdPattern.test(context.runId)
    && Number.isSafeInteger(context.epoch) && context.epoch >= 1 && context.epoch <= 999
    && typeof context.stateSha256 === 'string' && hexDigest.test(context.stateSha256);
  if (!ok) fail('CLOSED_SCHEMA', 'A closed run context (run id, epoch 1-999, state digest) is required; nothing is defaulted.');
}

function headerFor(context) {
  const body = { formatVersion: FORMAT_VERSION, kind: KIND, runId: context.runId, epoch: context.epoch, stateSha256: context.stateSha256 };
  return { ...body, sha256: digest(body) };
}

function recordFor(previous, event) {
  const body = { seq: event.seq, event: event.event, data: event.data, prevSha256: previous };
  return { ...body, sha256: digest(body) };
}

function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) offset += fs.writeSync(fd, bytes, offset, bytes.length - offset);
  fs.fsyncSync(fd);
}

function scanRun(runDir, epoch) {
  if (!ensureSafe(runDir, 'directory')) return [];
  const known = [];
  for (const name of fs.readdirSync(runDir)) {
    if (pendingDirectory.test(name)) fail('HOLD_UNOBSERVED', 'An unpublished epoch directory remains; it is never reclaimed automatically.');
    const match = epochDirectory.exec(name);
    if (!match) fail('UNEXPECTED_FILE', 'Unknown entry in the closed run history.');
    ensureSafe(path.join(runDir, name), 'directory');
    if (Number(match[1]) > epoch) fail('STALE_EPOCH', 'The persisted history already contains a later epoch; an epoch never goes backwards.');
    if (Number(match[1]) < epoch) known.push(Number(match[1]));
  }
  return known.sort((a, b) => a - b);
}

function createEpoch(runDir, epochDir, context) {
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const pending = `${epochDir}.pending-${randomUUID()}`;
  fs.mkdirSync(pending, { mode: 0o700 });
  for (const [name, bytes] of [['header.json', Buffer.from(`${canonical(headerFor(context))}\n`, 'utf8')], ['events.jsonl', Buffer.alloc(0)]]) {
    const fd = fs.openSync(path.join(pending, name), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    try { writeAll(fd, bytes); } finally { fs.closeSync(fd); }
  }
  fs.renameSync(pending, epochDir);
}

function readRegular(target, limit) {
  const stat = ensureSafe(target, 'file');
  if (!stat) fail('STATE_MISSING', 'A required persisted file is missing.');
  if (stat.size > limit) fail('STATE_OVERSIZE', `A persisted file exceeds the explicit ${limit}-byte safety ceiling.`);
  return fs.readFileSync(target);
}

function readHeader(target, context) {
  const stored = parseStored(readRegular(target, maxLineBytes));
  closed(stored, ['formatVersion', 'kind', 'runId', 'epoch', 'stateSha256', 'sha256'], 'header');
  if (stored.formatVersion !== FORMAT_VERSION || stored.kind !== KIND) fail('FILE_VERSION', 'Unknown persisted format; migration is not implicit.');
  if (stored.runId !== context.runId || stored.epoch !== context.epoch) fail('EPOCH_IDENTITY', 'The persisted header run and epoch do not match its directory identity.');
  const expected = headerFor(context);
  if (stored.stateSha256 !== expected.stateSha256 || stored.sha256 !== expected.sha256) {
    fail('STATE_DIGEST', 'The persisted header does not match the restored C015 run/epoch state digest.');
  }
  return expected;
}

function readLog(target, header) {
  const text = (() => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(readRegular(target, maxLogBytes)); } catch (error) {
      if (error instanceof FixtureError) throw error;
      return fail('INVALID_UTF8', 'The persisted event log is not valid UTF-8.');
    }
  })();
  const lines = text.split('\n');
  const tail = lines.pop();
  const events = [];
  let previous = header.sha256;
  let good = 0;
  for (const line of lines) {
    const bytes = Buffer.from(line, 'utf8');
    if (bytes.length > maxLineBytes) fail('STATE_OVERSIZE', 'A persisted event record exceeds the explicit line ceiling.');
    const stored = parseStored(bytes);
    closed(stored, ['seq', 'event', 'data', 'prevSha256', 'sha256'], 'event');
    if (stored.seq !== events.length + 1) fail('HISTORY_GAP', 'Persisted event sequences must be contiguous from 1.');
    if (stored.prevSha256 !== previous) fail('HISTORY_CHAIN', 'An event predecessor digest does not match the retained chain.');
    if (stored.sha256 !== recordFor(previous, stored).sha256) fail('STATE_DIGEST', 'An event digest does not match its data.');
    const data = stored.data;
    if (!data || typeof data !== 'object' || data.runId !== header.runId || data.epoch !== header.epoch || data.seq !== stored.seq) {
      fail('EPOCH_IDENTITY', 'An event does not carry the run, epoch and sequence of its log.');
    }
    events.push({ seq: stored.seq, event: stored.event, data });
    previous = stored.sha256;
    good += bytes.length + 1;
  }
  return { events, previous, goodBytes: good, tornTailBytes: Buffer.byteLength(tail, 'utf8') };
}

function openLog(root, context) {
  try {
    validateContext(context);
    const base = path.resolve(root);
    ensureSafe(base, 'directory');
    const runDir = path.join(base, context.runId);
    const epochDir = path.join(runDir, `epoch-${String(context.epoch).padStart(3, '0')}`);
    const knownEpochs = scanRun(runDir, context.epoch);
    const created = !ensureSafe(epochDir, 'directory');
    if (created) createEpoch(runDir, epochDir, context);
    ensureSafe(epochDir, 'directory');
    for (const name of fs.readdirSync(epochDir)) {
      if (!['header.json', 'events.jsonl'].includes(name)) fail('UNEXPECTED_FILE', 'Unknown file in the closed epoch directory.');
    }
    const header = readHeader(path.join(epochDir, 'header.json'), context);
    const eventsFile = path.join(epochDir, 'events.jsonl');
    const log = readLog(eventsFile, header);
    if (log.tornTailBytes > 0) {
      // An unterminated final record was never acknowledged: events are published only after the complete record is fsynced.
      const fd = fs.openSync(eventsFile, 'r+');
      try { fs.ftruncateSync(fd, log.goodBytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    const fd = fs.openSync(eventsFile, fs.constants.O_WRONLY | fs.constants.O_APPEND);
    let previous = log.previous;
    let lastSeq = log.events.length;
    let open = true;
    return {
      restored: { events: log.events, created, tornTailBytesDiscarded: log.tornTailBytes, knownEpochs },
      append(event) {
        try {
          if (!open) fail('STORAGE_ERROR', 'The persisted log is closed.');
          if (!event || event.seq !== lastSeq + 1) fail('HISTORY_GAP', 'Only the exact next event sequence may be appended.');
          const record = recordFor(previous, event);
          const bytes = Buffer.from(`${canonical(record)}\n`, 'utf8');
          if (bytes.length > maxLineBytes) fail('STATE_OVERSIZE', 'The encoded event exceeds the explicit line ceiling.');
          writeAll(fd, bytes);
          previous = record.sha256;
          lastSeq = event.seq;
          return record;
        } catch (error) {
          throw storageFailure(error);
        }
      },
      close() {
        if (open) {
          open = false;
          fs.closeSync(fd);
        }
      },
    };
  } catch (error) {
    throw storageFailure(error);
  }
}

module.exports = Object.freeze({ openLog, headerFor, recordFor, FORMAT_VERSION, KIND, maxLineBytes });
