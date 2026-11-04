'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  FixtureError, fail, closed, runIds, validateState, makePersisted, validatePersisted,
  parseStored, canonical, maxBytes,
} = require('./contract.cjs');
const { requireCurrentConsent } = require('./consent.cjs');
const { resolveNamespace, assertSafePath } = require('./paths.cjs');

const epochs = ['001', '002', '003'];
const faults = ['after-partial-write', 'after-flush', 'after-publish'];

function storageFailure(error) {
  if (error instanceof FixtureError) return error;
  return new FixtureError('STORAGE_ERROR', `Local filesystem operation failed (${error.code || 'UNKNOWN'}); no acknowledgment or reset.`, [
    { code: error.code || 'UNKNOWN' },
  ]);
}

async function mutate(location, target, operation) {
  await requireCurrentConsent();
  assertSafePath(location, target);
  return operation();
}

async function ensureDirectory(location, target) {
  const stat = assertSafePath(location, target, 'directory');
  if (!stat) await mutate(location, target, () => fs.mkdirSync(target, { mode: 0o700 }));
  assertSafePath(location, target, 'directory');
}

function checkFixture(location, allowOwnLock = false) {
  if (!assertSafePath(location, location.root, 'directory')) return false;
  for (const entry of fs.readdirSync(location.root)) {
    const target = path.join(location.root, entry);
    assertSafePath(location, target, entry === 'writer.lock' ? 'file' : 'directory');
    if (entry === 'writer.lock') {
      if (!allowOwnLock) fail('HOLD_UNOBSERVED', 'A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically.');
    } else if (!runIds.includes(entry)) {
      fail('UNEXPECTED_FILE', 'Unknown entry in the closed fixture namespace; no success fallback.');
    }
  }
  return true;
}

function readRegular(location, target) {
  const before = assertSafePath(location, target, 'file');
  if (!before) fail('STATE_MISSING', 'A required immutable state file is missing.');
  if (before.size > maxBytes) fail('STATE_OVERSIZE', `A persisted file exceeds the explicit ${maxBytes}-byte safety ceiling.`);
  const fd = fs.openSync(target, fs.constants.O_RDONLY);
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size) {
      fail('UNSAFE_FILE', 'The opened file differs from the checked regular file.');
    }
    const bytes = Buffer.alloc(before.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
      if (read === 0) break;
      offset += read;
    }
    const after = fs.fstatSync(fd);
    assertSafePath(location, target, 'file');
    if (offset !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      fail('STATE_CHANGED_DURING_READ', 'Persisted state changed during inspection; no partial result is returned.');
    }
    return bytes.subarray(0, offset);
  } finally {
    fs.closeSync(fd);
  }
}

async function history(location, runId, approval) {
  const directory = path.join(location.root, runId);
  if (!assertSafePath(location, directory, 'directory')) return [];
  const names = fs.readdirSync(directory);
  for (const name of names) {
    assertSafePath(location, path.join(directory, name), 'file');
    if (/^pending-00[123]\.json$/.test(name)) {
      fail('HOLD_UNOBSERVED', 'An unpublished staging file remains; no previous-state success fallback.');
    }
    if (!/^epoch-00[123]\.json$/.test(name)) fail('UNEXPECTED_FILE', 'Unknown file in closed run history.');
  }
  names.sort();
  const result = [];
  let previous = null;
  for (let index = 0; index < names.length; index++) {
    if (names[index] !== `epoch-${epochs[index]}.json`) fail('HISTORY_GAP', 'Immutable epoch history must be contiguous from epoch 1.');
    const persisted = await validatePersisted(parseStored(readRegular(location, path.join(directory, names[index]))), approval, previous);
    if (persisted.state.runId !== runId || persisted.state.epoch !== index + 1) {
      fail('EPOCH_IDENTITY', 'Persisted state run/epoch does not match its immutable file identity.');
    }
    previous = persisted.stateSha256;
    result.push(persisted);
  }
  return result;
}

function exitBeforeAck(stage, testFault) {
  if (stage !== testFault) return;
  process.stderr.write(`${JSON.stringify({ code: 'FAIL_BEFORE_ACK', stage, acknowledged: false, pid: process.pid })}\n`);
  process.exit(86);
}

function writeExclusive(location, target, bytes, partialFault) {
  if (assertSafePath(location, target, 'file')) fail('PUBLISH_EXISTS', 'Immutable files are never overwritten.');
  const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  try {
    if (!fs.fstatSync(fd).isFile()) fail('UNSAFE_FILE', 'Only regular files can be written.');
    if (partialFault) {
      fs.writeFileSync(fd, bytes.subarray(0, Math.max(1, Math.floor(bytes.length / 2))));
      exitBeforeAck('after-partial-write', partialFault);
    }
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== bytes.length) fail('WRITE_INCOMPLETE', 'Regular-file write/flush did not retain the exact bytes.');
  } finally {
    fs.closeSync(fd);
  }
}

async function persist(namespace, candidate, options = {}) {
  try {
    const location = resolveNamespace(namespace);
    const hasFault = options !== null && typeof options === 'object' && Object.hasOwn(options, 'testFault');
    closed(options, hasFault ? ['testFault'] : [], 'options');
    const testFault = options.testFault;
    if (testFault !== undefined && (!location.testOnly || !faults.includes(testFault))) {
      fail('TEST_FAULT_SCOPE', 'Deterministic exit faults are restricted to named test scratch fixtures and closed stages.');
    }
    const consent = await requireCurrentConsent();
    const state = await validateState(candidate, consent.C001);
    checkFixture(location);
    const retained = await history(location, state.runId, consent.C001);
    if (state.epoch !== retained.length + 1) fail('STALE_EPOCH', 'Only the exact next synthetic epoch may be published; retries never overwrite history.');
    await ensureDirectory(location, location.base);
    await ensureDirectory(location, location.root);
    const lock = path.join(location.root, 'writer.lock');
    const lockBytes = Buffer.from(`${canonical({ schemaVersion: 1, kind: 'C015-single-writer', namespace })}\n`);
    await mutate(location, lock, () => writeExclusive(location, lock, lockBytes));
    checkFixture(location, true);
    const directory = path.join(location.root, state.runId);
    await ensureDirectory(location, directory);
    const persisted = makePersisted(state, retained.at(-1)?.stateSha256 || null);
    const bytes = Buffer.from(`${canonical(persisted)}\n`, 'utf8');
    if (bytes.length > maxBytes) fail('STATE_OVERSIZE', 'Encoded state exceeds the explicit fixture safety ceiling.');
    const suffix = epochs[state.epoch - 1];
    const pending = path.join(directory, `pending-${suffix}.json`);
    const published = path.join(directory, `epoch-${suffix}.json`);
    await mutate(location, pending, () => writeExclusive(location, pending, bytes,
      testFault === 'after-partial-write' ? testFault : undefined));
    exitBeforeAck('after-flush', testFault);
    await mutate(location, published, () => {
      assertSafePath(location, pending, 'file');
      if (assertSafePath(location, published, 'file')) fail('PUBLISH_EXISTS', 'Immutable publication target already exists.');
      fs.renameSync(pending, published);
    });
    exitBeforeAck('after-publish', testFault);
    await mutate(location, published, () => {
      assertSafePath(location, published, 'file');
      const fd = fs.openSync(published, fs.constants.O_RDWR);
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.nlink !== 1) fail('UNSAFE_FILE', 'Published target is not a private regular file.');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    });
    const verified = await history(location, state.runId, consent.C001);
    if (canonical(verified.at(-1)) !== canonical(persisted)) fail('PUBLISH_VERIFICATION', 'Published bytes do not match the exact intended acknowledgment.');
    await mutate(location, lock, () => {
      assertSafePath(location, lock, 'file');
      fs.unlinkSync(lock);
    });
    return {
      schemaVersion: 1, mode: 'actual-local-filesystem', acknowledged: true,
      namespace, pid: process.pid, state: verified.at(-1).state,
      acknowledgment: verified.at(-1).acknowledgment, stateSha256: persisted.stateSha256,
      regularFileFlushes: 2, publish: 'same-directory-rename',
      directoryDurability: 'not-guaranteed', powerLossGuarantee: false,
    };
  } catch (error) {
    throw storageFailure(error);
  }
}

async function restore(namespace, runId) {
  try {
    const location = resolveNamespace(namespace);
    if (!runIds.includes(runId)) fail('UNKNOWN_RUN_ID', 'Only closed synthetic run IDs may be restored.');
    const consent = await requireCurrentConsent();
    if (!checkFixture(location)) fail('STATE_MISSING', 'The explicitly selected fixture has no persisted state; no initialization occurs on read.');
    const retained = await history(location, runId, consent.C001);
    if (!retained.length) fail('STATE_MISSING', 'The explicitly selected run has no persisted state; no synthetic fallback is returned.');
    checkFixture(location);
    const last = retained.at(-1);
    return {
      schemaVersion: 1, mode: 'actual-local-filesystem', restored: true,
      namespace, pid: process.pid, state: last.state, acknowledgment: last.acknowledgment,
      stateSha256: last.stateSha256,
      history: retained.map((entry) => ({ epoch: entry.state.epoch, stateSha256: entry.stateSha256 })),
      source: 'read-and-verified-immutable-files', writesPerformed: 0,
      directoryDurability: 'not-guaranteed', powerLossGuarantee: false,
    };
  } catch (error) {
    throw storageFailure(error);
  }
}

module.exports = Object.freeze({ persist, restore });
