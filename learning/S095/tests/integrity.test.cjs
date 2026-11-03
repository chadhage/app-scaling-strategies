'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const lesson = path.resolve(__dirname, '..');
const root = path.resolve(lesson, '..', '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const evidence = path.join(lesson, 'evidence');
const indexNames = fs.readdirSync(evidence).filter((name) => /^content-index(?:-\d{3})?\.json$/.test(name));
indexNames.sort((a, b) => Number(a.match(/(?:-(\d{3}))?\.json$/)[1] || 1) - Number(b.match(/(?:-(\d{3}))?\.json$/)[1] || 1));
const indexName = indexNames.at(-1);
assert.ok(indexName, 'A deliberate versioned content index is required.');
const index = JSON.parse(fs.readFileSync(path.join(evidence, indexName)));
const excluded = (file) => index.exclusions.some((item) => file === item || file.startsWith(`${item}${path.sep}`));
function files(directory = lesson, includeExcluded = false) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Owned evidence does not follow links outside its namespace.');
    if (!includeExcluded && excluded(path.relative(lesson, full))) return [];
    return entry.isDirectory() ? files(full, includeExcluded) : [path.relative(lesson, full)];
  }).sort((a, b) => a.localeCompare(b, 'en'));
}
function git(args, input) {
  const result = spawnSync('git', ['--no-pager', ...args], { cwd: root, input, encoding: null, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.toString('utf8'));
  return result.stdout;
}
const gitPath = (file) => path.relative(root, path.join(lesson, file)).replaceAll('\\', '/');

test('owned content index covers every non-self-referential file using declared raw or canonical LF integrity', () => {
  assert.equal(index.cardId, 'A-S095');
  const verificationLabel = indexName.replace('content-index', 'integrity').replace('.json', '');
  assert.equal(index.selfVerificationRun, verificationLabel);
  assert.deepEqual(index.exclusions, [`evidence\\${indexName}`, `evidence\\${verificationLabel}.json`, `evidence\\raw\\runs\\${verificationLabel}`]);
  const indexed = index.files.map((entry) => entry.path);
  assert.equal(new Set(indexed).size, indexed.length);
  assert.deepEqual(indexed, files());
  for (const entry of index.files) {
    assert.ok(!path.isAbsolute(entry.path) && !entry.path.split(path.sep).includes('..'));
    const bytes = fs.readFileSync(path.join(lesson, entry.path));
    const raw = entry.path.startsWith(`evidence${path.sep}raw${path.sep}`);
    assert.equal(entry.encoding, raw ? 'raw bytes (-text)' : 'canonical Git LF');
    assert.equal(sha(raw ? bytes : canonical(bytes)), entry.sha256, entry.path);
  }
});

test('read-only Git clean filters preserve raw CRLF and qualify canonical LF source bytes without writing objects', () => {
  for (const file of files()) {
    const bytes = fs.readFileSync(path.join(lesson, file));
    const raw = file.startsWith(`evidence${path.sep}raw${path.sep}`);
    const source = raw ? bytes : canonical(bytes);
    const blob = crypto.createHash('sha1').update(`blob ${source.length}\0`).update(source).digest('hex');
    assert.equal(git(['hash-object', `--path=${gitPath(file)}`, '--stdin'], bytes).toString('utf8').trim(), blob, file);
    if (raw) {
      const attributes = git(['check-attr', 'text', 'diff', '--', gitPath(file)]).toString('utf8');
      assert.match(attributes, /text: unset/);
      assert.match(attributes, /diff: unset/, 'Only owned raw evidence is binary-diff qualified; CRLF and original reporter spaces are not normalized.');
    }
  }
});

test('explicit published revision contains byte-preserved raw and qualified canonical Git lesson source', {
  skip: !process.env.S095_GIT_REV && 'Post-publication check requires the explicit full A-S095 publication SHA; no moving-HEAD inference.',
}, () => {
  const revision = process.env.S095_GIT_REV;
  assert.match(revision, /^[0-9a-f]{40}$/);
  const all = files(lesson, true);
  const tracked = git(['ls-tree', '-r', '--name-only', revision, '--', 'learning/S095'])
    .toString('utf8').trim().split('\n').map((file) => file.replace(/^learning\/S095\//, '').replaceAll('/', path.sep))
    .sort((a, b) => a.localeCompare(b, 'en'));
  assert.deepEqual(tracked, all);
  for (const file of all) {
    const bytes = fs.readFileSync(path.join(lesson, file));
    const raw = file.startsWith(`evidence${path.sep}raw${path.sep}`);
    assert.deepEqual(git(['show', `${revision}:${gitPath(file)}`]), raw ? bytes : canonical(bytes), file);
  }
});
