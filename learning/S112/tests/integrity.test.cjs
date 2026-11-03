'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const directory = path.resolve(__dirname, '..');
const root = path.resolve(directory, '..', '..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = (file) => path.relative(directory, file).split(path.sep).join('/');

function filesIn(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    assert.equal(entry.isSymbolicLink(), false, 'Owned evidence must not escape through links.');
    return entry.isDirectory() ? filesIn(file) : [file];
  }).sort();
}

test('all owned delivered source and historical proof match the immutable byte index', () => {
  const index = JSON.parse(fs.readFileSync(path.join(directory, 'evidence', 'content-index.json'), 'utf8'));
  assert.equal(index.scope, 'learning\\S112');
  const actual = filesIn(directory).map(relative).filter((file) => file !== 'evidence/content-index.json');
  assert.deepEqual(index.entries.map((entry) => entry.path).sort(), actual.sort());
  index.entries.forEach((entry) => {
    assert.equal(path.isAbsolute(entry.path), false);
    assert.equal(entry.path.split('/').includes('..'), false);
    const bytes = fs.readFileSync(path.join(directory, ...entry.path.split('/')));
    assert.equal(bytes.length, entry.bytes, `${entry.path} length`);
    assert.equal(hash(bytes), entry.sha256, `${entry.path} SHA256`);
  });
});

test('published helper identity and local offline tool pin are unchanged', () => {
  const helper = path.join(root, 'testing', 'browser', 'isolated.cjs');
  assert.equal(hash(fs.readFileSync(helper)), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const tooling = JSON.parse(fs.readFileSync(path.join(root, 'testing', 'browser', 'package.json'), 'utf8'));
  assert.equal(tooling.devDependencies.playwright, '1.56.1');
  const browser = JSON.parse(fs.readFileSync(path.join(directory, 'evidence', 'browser-observations.json'), 'utf8'));
  assert.equal(browser.helperSha256, hash(fs.readFileSync(helper)));
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(browser.cleanup, 'awaited session.close() completed');
  assert.equal(browser.csp.inlineExecuted, false);
  assert.equal(browser.csp.escapedConnectionRequests.length, 0);
  assert.equal(browser.observedAssertionsPassed, true);
});

test('raw evidence uses -text attributes and all captured output/snapshot hashes still match', () => {
  const rawPaths = filesIn(path.join(directory, 'evidence')).filter((file) =>
    relative(file).startsWith('evidence/raw/') || file.endsWith('.snapshot'));
  const attrs = spawnSync('git', ['check-attr', '-z', 'text', '--', ...rawPaths], {
    cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  assert.equal(attrs.status, 0, attrs.stderr);
  const fields = attrs.stdout.split('\0').filter(Boolean);
  for (let index = 0; index < fields.length; index += 3) assert.equal(fields[index + 2], 'unset', fields[index]);
  ['red', 'green', 'syntax', 'browser'].forEach((label) => {
    const folder = path.join(directory, 'evidence', 'raw', label);
    const run = JSON.parse(fs.readFileSync(path.join(folder, 'run.json'), 'utf8'));
    assert.equal(hash(fs.readFileSync(path.join(folder, 'stdout.raw'))), run.stdoutSha256);
    assert.equal(hash(fs.readFileSync(path.join(folder, 'stderr.raw'))), run.stderrSha256);
    assert.equal(label === 'red' ? run.genuineRed : run.passed, true);
    run.snapshots.forEach((snapshot) => {
      assert.equal(hash(fs.readFileSync(path.join(directory, snapshot.snapshot))), snapshot.sha256);
    });
  });
});
