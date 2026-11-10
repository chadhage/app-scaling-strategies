'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const pins = JSON.parse(fs.readFileSync(process.env.C009_IMPORTS_PIN_FILE || path.join(root, 'imports.json'), 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
const historyEnvironment = { ...process.env };
for (const key of Object.keys(historyEnvironment)) if (/^GIT_/i.test(key)) delete historyEnvironment[key];
const rootGitPresent = fs.existsSync(path.join(repository, '.git'));
const discoveryEnvironment = { ...historyEnvironment };
if (process.env.GIT_CEILING_DIRECTORIES) discoveryEnvironment.GIT_CEILING_DIRECTORIES = process.env.GIT_CEILING_DIRECTORIES;
const discovery = rootGitPresent ? null : spawnSync('git', ['--no-pager', 'rev-parse', '--absolute-git-dir'],
  { cwd: repository, env: discoveryEnvironment, encoding: 'utf8', windowsHide: true, timeout: 20000 });
const trulyNoRepository = !rootGitPresent && !discovery.error && discovery.status === 128 && discovery.stdout === '' && /not a git repository/i.test(discovery.stderr);

test('the accepted C001 producer files are the exact pinned bytes: Git blob at the accepted commit and the working copy agree',
  { skip: trulyNoRepository ? 'no git repository at this archive root or discoverable parent; accepted-commit history cannot be checked; independent import checks still run' : false }, () => {
  assert.match(pins.acceptedC001.commit, /^[0-9a-f]{40}$/);
  assert.equal(pins.acceptedC001.tag, `kanban/C001/${pins.acceptedC001.commit.slice(0, 12)}`);
  for (const [file, expected] of Object.entries(pins.c001CanonicalSha256)) {
    const blob = execFileSync('git', ['--no-pager', 'show', `${pins.acceptedC001.commit}:capability/C001/${file}`], { cwd: repository, env: historyEnvironment, timeout: 20000, windowsHide: true });
    assert.equal(hash(blob), expected, `accepted blob ${file}`);
    assert.equal(hash(canonical(fs.readFileSync(path.join(root, '..', 'C001', file)))), expected, `working copy ${file}`);
  }
});

test('every C001 file the production code requires is pinned', () => {
  const required = new Set();
  for (const file of fs.readdirSync(root).filter((name) => /\.c?js$/.test(name))) {
    for (const match of fs.readFileSync(path.join(root, file), 'utf8').matchAll(/require\('\.\.\/C001\/([^']+)'\)/g)) required.add(match[1]);
  }
  assert.deepEqual([...required].sort(), ['contract-guard.js']);
  assert.ok(Object.hasOwn(pins.c001CanonicalSha256, 'contract-guard.js'));
  assert.ok(Object.hasOwn(pins.c001CanonicalSha256, 'approved-contract.js'), 'contract-guard.js loads approved-contract.js');
});

test('no production file requires anything outside this namespace except the pinned C001 guard', () => {
  for (const file of fs.readdirSync(root).filter((name) => /\.c?js$/.test(name))) {
    for (const match of fs.readFileSync(path.join(root, file), 'utf8').matchAll(/require\('([^']+)'\)/g)) {
      const target = match[1];
      assert.ok(target.startsWith('node:') || target.startsWith('./') || target === '../C001/contract-guard.js', `${file} requires ${target}`);
    }
  }
});
