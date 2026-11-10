'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { withBareRoot, noRepository } = require('./u053-environment.cjs');

const root = path.resolve(__dirname, '..');
const subject = process.env.U053_SUBJECT_DIR ? path.resolve(process.env.U053_SUBJECT_DIR) : root;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const evidence = path.join(subject, 'evidence');
const local = (file) => file.replaceAll('/', '\\');
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const read = (file) => fs.readFileSync(path.join(subject, file));

function currentAuthority() {
  if (!fs.existsSync(path.join(subject, 'u053-cleanbase-addendum-1.json'))) return null;
  return require(path.join(subject, 'tests', 'u053-authority.cjs')).readCurrentAuthority(subject);
}

function pinnedEvidence() {
  const pinned = new Set();
  for (const name of fs.readdirSync(evidence, { recursive: true }).filter((name) => name.endsWith('.json'))) {
    const manifest = JSON.parse(fs.readFileSync(path.join(evidence, name), 'utf8'));
    for (const input of manifest.inputs || []) if (typeof input.path === 'string') pinned.add(local(input.path).replace(/^capability\\C009\\/, ''));
    for (const entry of Object.values(manifest.transcripts || {})) pinned.add(local(path.join('evidence', path.dirname(name), entry.path)));
    for (const nameOf of Object.keys(manifest.manifests || {})) pinned.add(local(path.join('evidence', path.dirname(name), `${nameOf}.json`)));
  }
  const authority = currentAuthority();
  if (authority) for (const file of authority.current.keys()) pinned.add(file.replace(/^capability\\C009\\/, ''));
  return pinned;
}

function citationProblems(text, exists = (file) => fs.existsSync(path.join(subject, file)), pinned = pinnedEvidence()) {
  const problems = [];
  for (const match of text.matchAll(/`(evidence[\\/][^`]+|suite-under-load\.json)`/g)) {
    let file = local(match[1]);
    if (file === 'suite-under-load.json') file = 'evidence\\green-fix3\\suite-under-load.json';
    if (/[*?]/.test(file)) {
      const regex = new RegExp(`^${file.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
      if (![...pinned].some((entry) => regex.test(entry) && exists(entry))) problems.push(`${file}: missing pinned evidence`);
    } else if (!exists(file)) problems.push(`${file}: missing evidence`);
    else if (!pinned.has(file) && ![...pinned].some((entry) => entry.startsWith(`${file}\\`) && exists(entry))) problems.push(`${file}: evidence exists but no manifest pins it`);
  }
  return problems;
}

test('U053 role-correct: README citations and all seven failed-loop figures describe retained evidence, not invented duration or load success', () => {
  const text = read('README.md').toString('utf8');
  assert.deepEqual(citationProblems(text), [], 'nonexistent or unpinned evidence citations fail by their actual path');
  assert.doesNotMatch(text, /suite-under-load\.json|gives the `duration_ms` of every file/);
  assert.match(text, /No whole-suite-under-load capture exists/);
  const figures = [['resources', 5], ['resources', 19], ['resources', 4], ['refusal-flood', 64], ['pipeline-process', 63],
    ['pipeline-refusal-mixed', 21], ['pipeline-refusal-http10', 15]];
  for (const [family, bad] of figures) assert.match(text, new RegExp(`${family}[^\\n]*\\*\\*${bad} bad of 64\\*\\*`), `${family}: exact retained figure ${bad}/64`);
  assert.match(text, /final R11 bytes failed by the (?:runner's )?60 s per-file cap/);
  assert.match(text, /unfinished[^.\n]*not retained/);
});

test('U053 role-correct: README REDs pin the consumed second-fix README and server-hole RED pins its consumed specimen, never an unread README', () => {
  const chain = currentAuthority();
  assert.ok(chain, 'an append-only authority from the accepted f95 seal must pin the actually consumed pristine subjects');
  const registry = JSON.parse(read('evidence\\u053-cleanbase\\subjects.json'));
  assert.equal(registry.subjects.length, 5);
  assert.equal(chain.subjects.size, 5);
  let total = 0;
  for (const entry of registry.subjects) {
    const subjectRecord = chain.subjects.get(entry.manifest.path);
    assert.ok(subjectRecord);
    const original = JSON.parse(read(entry.manifest.path.replace(/^capability\\C009\\/, '')));
    assert.equal(sha(read(entry.manifest.path.replace(/^capability\\C009\\/, ''))), entry.manifest.rawSha256, 'unchanged source manifest bytes');
    assert.equal(original.inputs.length, subjectRecord.inputs.length);
    for (const input of subjectRecord.inputs) {
      const bytes = read(input.pristinePath.replace(/^capability\\C009\\/, ''));
      assert.equal(bytes.length, input.bytes);
      assert.equal(sha(bytes), input.rawSha256, input.path);
      assert.equal(sha(lf(bytes)), input.crlfToLfSha256, input.path);
      total += 1;
    }
    const consumed = subjectRecord.inputs.find((input) => input.path === entry.consumedSubject.path);
    assert.ok(consumed, 'the role-selected subject was an actual original manifest input');
    assert.equal(consumed.rawSha256, entry.consumedSubject.rawSha256);
    if (entry.role === 'server-hole') {
      assert.match(consumed.path, /specimen-fix3\\server\.cjs$/);
      assert.equal(subjectRecord.inputs.some((input) => /README\.md$/.test(input.path)), false,
        'do not manufacture a README input the server-only RED did not consume');
    } else {
      assert.match(consumed.path, /README\.md$/);
      if (entry.role === 'readme-contract') assert.match(consumed.path, /snapshot-fix2\\README\.md$/);
    }
  }
  assert.equal(total, 179);
});

test('U053 role-correct: a real no-repository archive explicitly skips provenance with a reason while both independent import checks run', () => {
  const base = process.env.U053_SCRATCH_ROOT || path.join(root, 'tests', '.u053-scratch');
  const proof = withBareRoot(base, ({ root: directory, env }) => {
    const target = path.join(directory, 'capability', 'C009');
    fs.mkdirSync(path.join(target, 'tests'), { recursive: true });
    for (const file of fs.readdirSync(subject).filter((file) => fs.lstatSync(path.join(subject, file)).isFile())) {
      fs.copyFileSync(path.join(subject, file), path.join(target, file));
    }
    fs.copyFileSync(path.join(subject, 'tests', 'imports.test.cjs'), path.join(target, 'tests', 'imports.test.cjs'));
    const probe = noRepository(directory, env);
    const child = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'capability\\C009\\tests\\imports.test.cjs'],
      { cwd: directory, env, windowsHide: true, encoding: 'utf8', timeout: 120000 });
    assert.equal(child.error, undefined);
    assert.match(child.stdout, /# SKIP .*no git repository/i);
    assert.equal(child.status, 0, 'missing accepted history is explicitly skipped, not falsely checked through a parent .git');
    assert.match(child.stdout, /^# pass 2$/m);
    assert.match(child.stdout, /^# skipped 1$/m);
    return { probe, imports: { exitCode: child.status, pass: 2, skipped: 1, reasonPresent: true } };
  });
  console.log(`U053 TRUE BARE ${JSON.stringify(proof)}`);
  if (!process.env.U053_SCRATCH_ROOT && fs.existsSync(base) && !fs.readdirSync(base).length) fs.rmdirSync(base);
});

module.exports = Object.freeze({ citationProblems, pinnedEvidence });
