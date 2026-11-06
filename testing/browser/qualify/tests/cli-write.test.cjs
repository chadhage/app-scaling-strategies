'use strict';

// Mutant M27 and the branches of the --json check that need a file system unlike the real one: the report is created with
// the exclusive flag, so a file that appears AFTER the early check is never overwritten; odd answers of the file system
// are refused before anything runs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const cli = require('../cli.cjs');
const { fixtureAdapters } = require('./support.cjs');
const { scratchDir, removeDir } = require('./harness.cjs');

const sink = () => ({ text: '', write(chunk) { this.text += chunk; } });
const fault = (code) => Object.assign(new Error(`${code}: injected`), { code });
const folderFs = (overrides) => ({ lstatSync() { throw fault('ENOENT'); }, statSync: () => ({ isDirectory: () => true }), ...overrides });
const GOOD = { ok: true, version: '156.0.4314.58', path: 'p', major: 156, sha256: 's', signature: { publisher: 'Microsoft Corporation' } };

test('a file that appears after the early check is never overwritten: the real writer creates exclusively', async () => {
  const dir = scratchDir();
  try {
    const target = path.join(dir, 'raced.json');
    fs.writeFileSync(target, 'precious');
    const [out, err] = [sink(), sink()];
    const code = await cli.main(['--json', target], { stdout: out, stderr: err, fs: folderFs(), qualifyOptions: { adapters: fixtureAdapters() } });
    assert.equal(code, 2);
    assert.equal(fs.readFileSync(target, 'utf8'), 'precious');
    assert.match(err.text, /^PASS Edge .* \| cannot write .*raced\.json: EEXIST: file already exists/);
    assert.equal(err.text.trim().split('\n').length, 1);
    assert.equal(JSON.parse(out.text).ok, true);
  } finally {
    removeDir(dir);
  }
});

test('a parent that is not a folder and a target that cannot be inspected are refused before anything runs', async () => {
  const cases = [
    [folderFs({ statSync: () => ({ isDirectory: () => false }) }), /^invalid --json target "out\.json": its parent is not a folder\n$/],
    [folderFs({ statSync() { throw fault('ENOENT'); } }), /^invalid --json target "out\.json": the folder does not exist\n$/],
    [folderFs({ lstatSync() { throw fault('EACCES'); } }), /^invalid --json target "out\.json": it cannot be inspected \(EACCES\)\n$/],
    [folderFs({ lstatSync() { throw new Error('odd\r\nfailure'); } }), /^invalid --json target "out\.json": it cannot be inspected \(odd failure\)\n$/],
  ];
  for (const [fsApi, expected] of cases) {
    let started = 0;
    const [out, err] = [sink(), sink()];
    const code = await cli.main(['--json', 'out.json'], { stdout: out, stderr: err, fs: fsApi, qualify: async () => { started += 1; return GOOD; } });
    assert.equal(code, 2);
    assert.equal(out.text, '');
    assert.match(err.text, expected);
    assert.equal(started, 0);
  }
});
