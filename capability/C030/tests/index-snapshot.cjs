'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const repository = path.resolve(__dirname, '..', '..', '..');
function parseDebug(buffer) {
  const result = new Map();
  let offset = 0;
  while (offset < buffer.length) {
    const end = buffer.indexOf(0, offset);
    assert.ok(end >= offset);
    const name = buffer.subarray(offset, end).toString('utf8');
    let tail = end + 1;
    for (let line = 0; line < 5; line++) {
      tail = buffer.indexOf(10, tail);
      assert.ok(tail >= 0);
      tail++;
    }
    const flags = /flags: ([0-9a-f]+)\r?\n$/.exec(buffer.subarray(end + 1, tail).toString('ascii'));
    assert.ok(flags);
    result.set(name, flags[1]);
    offset = tail;
  }
  return result;
}
function snapshot() {
  if (arguments.length) throw new Error('No ownership/path overrides.');
  const git = (args) => execFileSync('git', ['--no-pager', 'ls-files', ...args, '-z'], {
    cwd: repository, timeout: 15000, windowsHide: true, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
  });
  const stage = git(['--stage']);
  const debug = parseDebug(git(['--debug']));
  const tagged = (bytes) => new Map(bytes.toString('utf8').split('\0').filter(Boolean).map((line) => [line.slice(2), line[0]]));
  const assume = tagged(git(['-v']));
  const fsmonitor = tagged(git(['-f']));
  const entries = stage.toString('utf8').split('\0').filter(Boolean).map((line) => {
    const split = line.indexOf('\t');
    assert.ok(split > 0);
    const name = line.slice(split + 1);
    return { path: name, stageEntry: line.slice(0, split), assumeAndSkipWorktreeTag: assume.get(name),
      fsmonitorTag: fsmonitor.get(name), debugFlags: debug.get(name) };
  }).filter((entry) => !entry.path.startsWith('capability/C030/'));
  entries.forEach((entry) => {
    assert.equal(typeof entry.debugFlags, 'string');
    assert.equal(typeof entry.assumeAndSkipWorktreeTag, 'string');
    assert.equal(typeof entry.fsmonitorTag, 'string');
  });
  return { entries, entryCount: entries.length,
    sha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
    flagsCovered: ['stage/mode/blob', 'assume-unchanged', 'skip-worktree', 'fsmonitor', 'debug flags'],
    ordinaryStagedModificationIsNotUnmerged: true };
}
module.exports = Object.freeze({ parseDebug, snapshot });
if (require.main === module) {
  assert.equal(process.argv.length, 2);
  console.log(JSON.stringify(snapshot()));
}
