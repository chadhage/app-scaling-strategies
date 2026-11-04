'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function invalid(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function inspectRows(rows) {
  if (!Array.isArray(rows) || Object.keys(rows).length !== rows.length
      || rows.some(row => !row || typeof row.path !== 'string' || !row.path
        || !/^[0-7]{6}$/.test(row.mode) || !/^[a-f0-9]{40,64}$/.test(row.oid)
        || !/^[0-3]$/.test(row.stage) || !/^[a-f0-9]+$/.test(row.debugFlags)
        || !/^[A-Za-z?]$/.test(row.assumeUnchangedTag) || !/^[A-Za-z?]$/.test(row.fsmonitorTag))) {
    throw invalid('ERR_INDEX_DATA', 'Dense complete index entries and all flags are required.');
  }
  if (rows.some(row => row.stage !== '0')) {
    throw invalid('ERR_UNMERGED_INDEX', 'Unmerged index entries are not publishable; no path is repaired or reset.');
  }
  const foreignEntries = rows.filter(row => !row.path.startsWith('capability/X003/'))
    .map(row => Object.freeze({ ...row })).sort((a, b) => a.path.localeCompare(b.path));
  return Object.freeze({
    schema: 'X003/index-snapshot/1', cardId: 'X003', entryCount: rows.length,
    foreignEntries: Object.freeze(foreignEntries), foreignEntryCount: foreignEntries.length,
    foreignMetadataSha256: hash(Buffer.from(JSON.stringify(foreignEntries))), unmergedEntries: 0
  });
}
function verifyPreserved(before, after) {
  for (const value of [before, after]) {
    if (value?.schema !== 'X003/index-snapshot/1' || value.cardId !== 'X003' || value.unmergedEntries !== 0) {
      throw invalid('ERR_INDEX_DATA', 'Validated conflict-free index snapshots are required.');
    }
    const verified = inspectRows(value.foreignEntries);
    if (verified.foreignMetadataSha256 !== value.foreignMetadataSha256
        || verified.foreignEntryCount !== value.foreignEntryCount) {
      throw invalid('ERR_INDEX_DATA', 'Foreign entry or flag metadata does not match its snapshot fingerprint.');
    }
  }
  if (JSON.stringify(before.foreignEntries) !== JSON.stringify(after.foreignEntries)) {
    throw invalid('ERR_INDEX_PRESERVATION', 'An unowned index entry, blob, mode, stage or flag changed; never repair the unowned path.');
  }
  return Object.freeze({
    schema: 'X003/foreign-index-preservation/1', cardId: 'X003',
    preserved: true, unmergedEntries: 0, foreignEntryCount: before.foreignEntryCount,
    foreignMetadataSha256: before.foreignMetadataSha256,
    comparedFields: Object.freeze(['path', 'mode', 'oid', 'stage', 'debugFlags', 'assumeUnchangedTag', 'fsmonitorTag']),
    ordinaryForeignStagedEntriesAllowed: true, unownedIndexOrFileWritesPerformed: false
  });
}
function parseIndex(stageBytes, debugBytes, assumeBytes, fsmonitorBytes) {
  const stageRows = stageBytes.toString('utf8').split('\0').filter(Boolean).map(line => {
    const match = /^([0-7]{6}) ([a-f0-9]{40,64}) ([0-3])\t([\s\S]+)$/.exec(line);
    if (!match) throw invalid('ERR_INDEX_DATA', 'Git stage metadata could not be parsed without loss.');
    return { mode: match[1], oid: match[2], stage: match[3], path: match[4] };
  });
  if (stageRows.some(row => row.stage !== '0')) {
    throw invalid('ERR_UNMERGED_INDEX', 'Any actual unmerged index entry blocks publication before staging.');
  }
  function tags(bytes) {
    const values = new Map();
    for (const item of bytes.toString('utf8').split('\0').filter(Boolean)) {
      if (item[1] !== ' ' || values.has(item.slice(2))) throw invalid('ERR_INDEX_DATA', 'Git flag metadata is incomplete.');
      values.set(item.slice(2), item[0]);
    }
    return values;
  }
  const assume = tags(assumeBytes);
  const monitor = tags(fsmonitorBytes);
  const debug = new Map();
  const source = debugBytes.toString('utf8');
  let offset = 0;
  while (offset < source.length) {
    const end = source.indexOf('\0', offset);
    if (end < 0) throw invalid('ERR_INDEX_DATA', 'Git debug metadata is not NUL-delimited.');
    const name = source.slice(offset, end);
    const detail = /^  ctime:[^\n]*\n  mtime:[^\n]*\n  dev:[^\n]*\n  uid:[^\n]*\n  size:[^\n]*\tflags: ([a-f0-9]+)\r?\n/.exec(source.slice(end + 1));
    if (!detail || debug.has(name)) throw invalid('ERR_INDEX_DATA', 'Every Git index entry must retain its full debug flags.');
    debug.set(name, detail[1]);
    offset = end + 1 + detail[0].length;
  }
  if ([debug, assume, monitor].some(values => values.size !== stageRows.length)) {
    throw invalid('ERR_INDEX_DATA', 'Stage and flag entry counts differ; no positive fallback.');
  }
  return stageRows.map(row => ({
    ...row, debugFlags: debug.get(row.path), assumeUnchangedTag: assume.get(row.path), fsmonitorTag: monitor.get(row.path)
  }));
}
function readIndex() {
  const options = { cwd: repository, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 };
  const commands = {
    stage: ['ls-files', '--stage', '--full-name', '-z'],
    debug: ['ls-files', '--debug', '--full-name', '-z'],
    assume: ['ls-files', '-v', '--full-name', '-z'],
    fsmonitor: ['ls-files', '-f', '--full-name', '-z']
  };
  const streams = Object.fromEntries(Object.entries(commands).map(([name, args]) =>
    [name, execFileSync('git', ['--no-pager', ...args], options)]));
  const stageAfter = execFileSync('git', ['--no-pager', ...commands.stage], options);
  if (!streams.stage.equals(stageAfter)) {
    throw invalid('ERR_INDEX_PRESERVATION', 'Index entries changed during the read-only snapshot; no staging is attempted.');
  }
  const rows = parseIndex(streams.stage, streams.debug, streams.assume, streams.fsmonitor);
  return { snapshot: inspectRows(rows), commands, streams };
}
function capture(directory, label) {
  assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1');
  const target = path.resolve(directory);
  assert.ok(target.startsWith(`${path.join(root, 'evidence', 'publication')}${path.sep}`));
  assert.ok(['before', 'pre-delegation', 'after'].includes(label));
  const observed = readIndex();
  const streams = Object.fromEntries(Object.entries(observed.streams).map(([name, bytes]) => {
    const output = path.join(target, `index-${label}-${name}.raw.gz`);
    fs.writeFileSync(output, zlib.gzipSync(bytes), { flag: 'wx' });
    return [name, { path: path.relative(repository, output), sha256: hash(bytes), bytes: bytes.length,
      arguments: observed.commands[name] }];
  }));
  const record = { ...observed.snapshot, capturedAtUtc: new Date().toISOString(),
    comparedCachedStatFields: false, streams, indexWritesPerformed: false };
  const output = path.join(target, `index-${label}.snapshot.json`);
  fs.writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  console.log(`X003_INDEX_SNAPSHOT ${output}`);
  return record;
}
module.exports = Object.freeze({ inspectRows, verifyPreserved, parseIndex, readIndex, capture });
if (require.main === module) {
  const [mode, first, second] = process.argv.slice(2);
  if (mode === 'capture') capture(first, second);
  else if (mode === 'verify') {
    console.log(JSON.stringify(verifyPreserved(JSON.parse(fs.readFileSync(first)), JSON.parse(fs.readFileSync(second)))));
  } else throw invalid('ERR_INDEX_ACTION', 'Only read-only snapshot capture or comparison is allowed.');
}
