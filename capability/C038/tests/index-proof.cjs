'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { gzipSync, gunzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert.ok(['before', 'after', 'probe'].includes(mode));
let directory;
if (mode !== 'probe') {
  assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1');
  directory = path.resolve(process.env.C038_CAPTURE_DIR || '');
  assert.equal(path.dirname(directory), path.join(root, 'evidence', 'raw'));
  assert.match(path.basename(directory), /^publication-[0-9a-f-]{36}$/);
  assert.equal(fs.realpathSync(directory), directory);
}
const git = (args) => execFileSync('git', ['--no-pager', ...args], {
  cwd: repository, encoding: null, windowsHide: true, timeout: 20000, maxBuffer: 64 * 1024 * 1024
});
assert.equal(git(['ls-files', '--unmerged', '-z']).length, 0, 'Unmerged entries are forbidden; an ordinary foreign staged M is not unmerged and must be preserved.');
const raw = git(['ls-files', '--stage', '--debug', '-z']);
const assume = git(['ls-files', '-v', '-z']);
const monitor = git(['ls-files', '-f', '-z']);
const entries = [];
let offset = 0;
while (offset < raw.length) {
  const end = raw.indexOf(0, offset);
  assert.ok(end >= offset);
  const header = /^([0-7]{6}) ([0-9a-f]{40}) ([0-3])\t([\s\S]+)$/.exec(raw.subarray(offset, end).toString('utf8'));
  assert.ok(header);
  const flagAt = raw.indexOf(Buffer.from('\tflags: '), end + 1);
  const flagEnd = raw.indexOf(10, flagAt);
  assert.ok(flagAt > end && flagEnd > flagAt);
  const flags = /^flags: ([0-9a-f]+)$/.exec(raw.subarray(flagAt + 1, flagEnd).toString('ascii'));
  assert.ok(flags);
  entries.push({ mode: header[1], oid: header[2], stage: Number(header[3]), path: header[4], flags: flags[1] });
  offset = flagEnd + 1;
}
function tags(bytes) {
  return new Map(bytes.toString('utf8').split('\0').filter(Boolean).map((line) => [line.slice(2), line[0]]));
}
const v = tags(assume);
const f = tags(monitor);
const foreign = entries.filter((entry) => !entry.path.startsWith('capability/C038/')).map((entry) =>
  ({ ...entry, assumeUnchangedOrSkipWorktreeTag: v.get(entry.path), fsmonitorTag: f.get(entry.path) }));
assert.ok(foreign.length > 0);
assert.ok(foreign.every((entry) => entry.assumeUnchangedOrSkipWorktreeTag && entry.fsmonitorTag));
if (mode === 'probe') {
  console.log(JSON.stringify({ cardId: 'C038', readOnlyIndexProbe: true,
    entryCount: entries.length, foreignEntryCount: foreign.length,
    everyEntryAndFlagParsed: true, sourceEvidenceAndIndexWrites: 0 }));
  return;
}
for (const [name, bytes] of [['stage-debug', raw], ['assume-flags', assume], ['fsmonitor-flags', monitor]]) {
  fs.writeFileSync(path.join(directory, `index-${mode}-${name}.raw.gz`), gzipSync(bytes), { flag: 'wx' });
}
const snapshot = { foreignEntries: foreign, entryCount: entries.length,
  foreignEntryCount: foreign.length, ownEntries: entries.length - foreign.length };
fs.writeFileSync(path.join(directory, `index-${mode}.json.gz`), gzipSync(Buffer.from(`${JSON.stringify(snapshot)}\n`)), { flag: 'wx' });
if (mode === 'after') {
  const before = JSON.parse(gunzipSync(fs.readFileSync(path.join(directory, 'index-before.json.gz'))));
  assert.deepEqual(foreign, before.foreignEntries, 'Preserve every original foreign index entry AND every flag; never clean up C048.');
  console.log(JSON.stringify({ cardId: 'C038', allForeignEntriesAndFlagsPreserved: true,
    foreignEntryCount: foreign.length,
    c048OrdinaryStagedEntryPreserved: foreign.some((entry) => entry.path === 'capability/C048/evidence/red/replay.cjs.txt') }));
} else {
  console.log(JSON.stringify({ cardId: 'C038', beforeAnyStage: true, unmergedEntries: 0,
    foreignEntryCount: foreign.length, allForeignFlagsCaptured: true }));
}
