'use strict';

// U032 specification of the owned, chained, append-only amendment path of C021 and of the C020 drift rule that integrity.test.cjs runs.
// The chain logic is tested with in-memory fixtures; the drift rule with small scratch git repositories under os.tmpdir().
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { before, after } = require('node:test');
const amendments = require('./amendments.cjs');

const { hash, SCHEMA, MANIFEST_PATH, EVIDENCE_ROOT } = amendments;
const INTEGRITY = 'capability\\C021\\tests\\integrity.test.cjs';
const COMPAT = 'capability\\C021\\compatibility.js';
const README = 'capability\\C021\\README.md';
const V1 = Buffer.from('integrity test v1');
const V2 = Buffer.from('integrity test v2');
const V3 = Buffer.from('integrity test v3');
const sealedFiles = new Map([[INTEGRITY, V1], [COMPAT, Buffer.from('compatibility')], [README, Buffer.from('readme')]]);
const entries = [...sealedFiles].map(([name, bytes]) => ({ path: name, sha256: hash(bytes) }));
const base = { path: MANIFEST_PATH, rawSha256: hash(Buffer.from('{"sealed":"manifest"}')) };
const evidenceFile = `${EVIDENCE_ROOT}red-01.json`;
const step = (overrides = {}) => ({ path: INTEGRITY, previousRawSha256: hash(V1), rawSha256: hash(V2), edit: 'test 1 and test 6 read the chain', ...overrides });
const addendum = (overrides = {}) => ({ schema: SCHEMA, cardId: 'C021', sequence: 1, item: 'U032', reason: 'owned amendment path', base, previous: null,
  amendments: [step()], evidence: [], ...overrides });
const file = (value, sequence = 1) => ({ name: amendments.addendumName(sequence), bytes: Buffer.from(`${JSON.stringify(value, null, 2)}\n`) });
const chainOf = (...addenda) => amendments.resolveChain({ sealed: entries, base, addenda });
const liveOf = (...changes) => {
  const live = new Map(sealedFiles);
  for (const [name, bytes] of changes) live.set(name, bytes);
  return (relative) => live.get(relative);
};
function refuses(fn, code, detail) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, code, error.message);
    if (detail) assert.ok(error.message.includes(detail), error.message);
    return true;
  });
}
const sealedCheck = (chain, ...changes) => () => amendments.checkSealed({ entries, chain, read: liveOf(...changes) });

test('sealed bytes stay exact when no addendum supersedes them', () => {
  const chain = chainOf();
  assert.equal(chain.count, 0);
  assert.equal(sealedCheck(chain)(), entries.length);
  for (const name of sealedFiles.keys()) refuses(sealedCheck(chain, [name, Buffer.from('edited')]), 'SEALED_BYTES_CHANGED', name);
  refuses(sealedCheck(chain, [COMPAT, undefined]), 'SEALED_FILE_MISSING', COMPAT);
});

test('the replaced integrity test is accepted only through the addendum, and only as exactly the named bytes', () => {
  const chain = chainOf(file(addendum()));
  assert.equal(chain.count, 1);
  assert.equal(sealedCheck(chain, [INTEGRITY, V2])(), entries.length);
  for (const bytes of [V1, V3, Buffer.alloc(0), Buffer.from(`${V2}\n`)]) refuses(sealedCheck(chain, [INTEGRITY, bytes]), 'SEALED_BYTES_CHANGED', INTEGRITY);
});

test('a missing addendum leaves the replaced integrity test unaccepted', () => {
  refuses(sealedCheck(chainOf(), [INTEGRITY, V2]), 'SEALED_BYTES_CHANGED', INTEGRITY);
});

test('a change to another sealed file is rejected even with a valid addendum', () => {
  const chain = chainOf(file(addendum()));
  for (const other of [COMPAT, README]) refuses(sealedCheck(chain, [INTEGRITY, V2], [other, Buffer.from('edited')]), 'SEALED_BYTES_CHANGED', other);
});

test('a modified addendum that stays self-consistent still has to match the live replaced bytes', () => {
  const chain = chainOf(file(addendum({ amendments: [step({ rawSha256: hash(V3) })] })));
  refuses(sealedCheck(chain, [INTEGRITY, V2]), 'SEALED_BYTES_CHANGED', INTEGRITY);
  assert.equal(sealedCheck(chain, [INTEGRITY, V3])(), entries.length);
});

const omit = (value, key) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
const malformed = [
  ['invalid JSON', () => ({ name: amendments.addendumName(1), bytes: Buffer.from('{') }), 'ADDENDUM_JSON'],
  ['file name of another sequence', () => file(addendum(), 2), 'ADDENDUM_SEQUENCE'],
  ['claimed sequence', () => file(addendum({ sequence: 2 })), 'ADDENDUM_SEQUENCE'],
  ['unknown schema', () => file(addendum({ schema: 'C021-evidence-addendum/2' })), 'ADDENDUM_SCHEMA'],
  ['another card', () => file(addendum({ cardId: 'C020' })), 'ADDENDUM_SCHEMA'],
  ['extra key', () => file({ ...addendum(), extra: true }), 'ADDENDUM_SHAPE'],
  ['missing key', () => file(omit(addendum(), 'reason')), 'ADDENDUM_SHAPE'],
  ['blank reason', () => file(addendum({ reason: ' ' })), 'ADDENDUM_SHAPE'],
  ['nothing recorded', () => file(addendum({ amendments: [], evidence: [] })), 'ADDENDUM_SHAPE'],
  ['other base path', () => file(addendum({ base: { ...base, path: README } })), 'ADDENDUM_BASE'],
  ['other base hash', () => file(addendum({ base: { ...base, rawSha256: hash('other') } })), 'ADDENDUM_BASE'],
  ['previous link on the first addendum', () => file(addendum({ previous: { name: 'evidence-addendum-1.json', rawSha256: hash('x') } })), 'ADDENDUM_CHAIN'],
  ['amendment of a file that is not amendable', () => file(addendum({ amendments: [step({ path: COMPAT })] })), 'AMENDMENT_PATH_NOT_ALLOWED'],
  ['superseded hash that is not the sealed one', () => file(addendum({ amendments: [step({ previousRawSha256: hash('other') })] })), 'AMENDMENT_PREVIOUS_MISMATCH'],
  ['replacement equal to the superseded bytes', () => file(addendum({ amendments: [step({ rawSha256: hash(V1) })] })), 'AMENDMENT_NOOP'],
  ['malformed replacing hash', () => file(addendum({ amendments: [step({ rawSha256: 'ABC' })] })), 'AMENDMENT_HASH'],
  ['amendment with an extra key', () => file(addendum({ amendments: [{ ...step(), more: 1 }] })), 'ADDENDUM_SHAPE'],
  ['amendment without an edit note', () => file(addendum({ amendments: [step({ edit: '' })] })), 'ADDENDUM_SHAPE'],
  ['same path twice in one addendum', () => file(addendum({ amendments: [step(), step()] })), 'AMENDMENT_DUPLICATE_PATH']
];
for (const [name, make, code] of malformed) {
  test(`a malformed addendum is rejected: ${name}`, () => refuses(() => chainOf(make()), code));
}

test('indexed evidence is hash checked and confined to the U032 evidence folder', () => {
  const bytes = Buffer.from('raw evidence');
  const entry = { path: evidenceFile, rawSha256: hash(bytes) };
  const chain = chainOf(file(addendum({ evidence: [entry] })));
  assert.equal(amendments.checkEvidence({ chain, read: () => bytes }), 1);
  refuses(() => amendments.checkEvidence({ chain, read: () => Buffer.from('changed') }), 'EVIDENCE_BYTES_CHANGED', evidenceFile);
  const rejected = [
    [{ ...entry, path: 'capability\\C021\\evidence\\red\\x.json' }, 'EVIDENCE_PATH_NOT_ALLOWED'],
    [{ ...entry, path: INTEGRITY }, 'EVIDENCE_PATH_NOT_ALLOWED'],
    [{ ...entry, path: `${EVIDENCE_ROOT}..\\..\\evidence.json` }, 'EVIDENCE_PATH_NOT_ALLOWED'],
    [{ ...entry, path: `${EVIDENCE_ROOT}raw/x.gz` }, 'EVIDENCE_PATH_NOT_ALLOWED'],
    [{ ...entry, path: EVIDENCE_ROOT }, 'EVIDENCE_PATH_NOT_ALLOWED'],
    [{ ...entry, rawSha256: 'xyz' }, 'EVIDENCE_ENTRY'],
    [omit(entry, 'rawSha256'), 'EVIDENCE_ENTRY'],
    [{ ...entry, more: 1 }, 'EVIDENCE_ENTRY']
  ];
  for (const [value, code] of rejected) refuses(() => chainOf(file(addendum({ evidence: [value] }))), code);
  refuses(() => chainOf(file(addendum({ evidence: [entry, entry] }))), 'EVIDENCE_DUPLICATE', evidenceFile);
  const sealed = [...entries, { path: evidenceFile, sha256: hash(bytes) }];
  refuses(() => amendments.resolveChain({ sealed, base, addenda: [file(addendum({ evidence: [entry] }))] }), 'EVIDENCE_PATH_NOT_ALLOWED', evidenceFile);
});

test('addenda are chained by raw SHA-256 and every amendment names the head it supersedes', () => {
  const first = file(addendum());
  const link = { name: first.name, rawSha256: hash(first.bytes) };
  const later = (overrides = {}) => file(addendum({ sequence: 2, previous: link, amendments: [],
    evidence: [{ path: evidenceFile, rawSha256: hash('evidence') }], ...overrides }), 2);
  const chain = chainOf(first, later());
  assert.equal(chain.count, 2);
  assert.deepEqual(chain.tip, { name: 'evidence-addendum-2.json', rawSha256: hash(later().bytes) });
  assert.equal(sealedCheck(chain, [INTEGRITY, V2])(), entries.length);
  refuses(() => chainOf(file(addendum({ reason: 'edited after the next addendum pinned it' })), later()), 'ADDENDUM_CHAIN');
  refuses(() => chainOf(first, later({ previous: null })), 'ADDENDUM_CHAIN');
  refuses(() => chainOf(first, later({ previous: { name: 'evidence-addendum-9.json', rawSha256: link.rawSha256 } })), 'ADDENDUM_CHAIN');
  refuses(() => chainOf(first, file(addendum({ sequence: 2, previous: link }), 3)), 'ADDENDUM_SEQUENCE');
  const replaced = chainOf(first, later({ amendments: [step({ previousRawSha256: hash(V2), rawSha256: hash(V3) })] }));
  assert.equal(sealedCheck(replaced, [INTEGRITY, V3])(), entries.length);
  refuses(sealedCheck(replaced, [INTEGRITY, V2]), 'SEALED_BYTES_CHANGED', INTEGRITY);
  refuses(() => chainOf(first, later({ amendments: [step()] })), 'AMENDMENT_PREVIOUS_MISMATCH');
});

test('listAddenda reads only regular, single-link, numbered addendum files in sequence order', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'u032-list-'));
  try {
    for (const [name, text] of [['evidence-addendum-10.json', 'ten'], ['evidence-addendum-2.json', 'two'], ['evidence-addendum-1.json', 'one'],
      ['evidence-addendum-01.json', 'x'], ['evidence-addendum-1.json.bak', 'x'], ['evidence.json', 'x']]) fs.writeFileSync(path.join(dir, name), text);
    assert.deepEqual(amendments.listAddenda(dir).map((entry) => [entry.name, entry.bytes.toString()]),
      [['evidence-addendum-1.json', 'one'], ['evidence-addendum-2.json', 'two'], ['evidence-addendum-10.json', 'ten']]);
    fs.mkdirSync(path.join(dir, 'evidence-addendum-3.json'));
    refuses(() => amendments.listAddenda(dir), 'ADDENDUM_FILE', 'evidence-addendum-3.json');
    fs.rmdirSync(path.join(dir, 'evidence-addendum-3.json'));
    fs.linkSync(path.join(dir, 'evidence-addendum-2.json'), path.join(dir, 'evidence-addendum-3.json'));
    refuses(() => amendments.listAddenda(dir), 'ADDENDUM_FILE');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the drift command excludes only Added and lists everything else with its status', () => {
  assert.deepEqual(amendments.driftArgs('abc123'), ['--no-pager', 'diff', '--exit-code', '--no-renames', '--name-status',
    '--diff-filter=MDTUXBR', 'abc123', '--', 'capability/C020']);
  assert.equal(amendments.DRIFT_FILTER.includes('A'), false);
  for (const status of 'MDTUXBR') assert.ok(amendments.DRIFT_FILTER.includes(status), status);
});

const cleanEnv = Object.fromEntries(Object.entries(process.env)
  .filter(([name]) => !/^(?:GIT_DIR|GIT_INDEX_FILE|GIT_WORK_TREE|GIT_PREFIX|NODE_TEST_CONTEXT|NODE_V8_COVERAGE)$/.test(name)));
const tmpRoot = path.resolve(os.tmpdir());
const C020 = 'capability/C020';
const A = `${C020}/a.js`;
const NEW = `${C020}/new.txt`;
function git(cwd, ...args) {
  assert.ok(path.resolve(cwd).startsWith(`${tmpRoot}${path.sep}`), 'scratch git commands never run outside os.tmpdir()');
  return execFileSync('git', ['-c', 'user.name=u032', '-c', 'user.email=u032@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args],
    { cwd, env: cleanEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
const put = (dir, relative, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
  fs.writeFileSync(path.join(dir, relative), text);
};
const make = (relative) => (dir) => put(dir, relative, 'added\n');
const edit = (relative) => (dir) => fs.appendFileSync(path.join(dir, relative), 'edited\n');
const drop = (relative) => (dir) => fs.rmSync(path.join(dir, relative));
const stage = (...paths) => (dir) => git(dir, 'add', '--', ...paths);
const commit = (dir) => git(dir, 'commit', '--quiet', '-m', 'change');
const move = (from, to) => (dir) => {
  fs.mkdirSync(path.dirname(path.join(dir, to)), { recursive: true });
  git(dir, 'mv', from, to);
};
const mode = (relative) => (dir) => git(dir, 'update-index', '--chmod=+x', '--', relative);
const scenarios = [
  ['no change', [], []],
  ['an untracked addition', [make(NEW)], []],
  ['a staged addition', [make(NEW), stage(NEW)], []],
  ['a committed addition', [make(NEW), stage(NEW), commit], []],
  ['a committed addition in new sub folders', [make(`${C020}/deep/er/new.txt`), stage(`${C020}/deep`), commit], []],
  ['a committed addition outside C020', [make('other/new.txt'), stage('other/new.txt'), commit], []],
  ['a modification in the working tree', [edit(A)], [`M\t${A}`]],
  ['a staged modification', [edit(A), stage(A)], [`M\t${A}`]],
  ['a committed modification', [edit(A), stage(A), commit], [`M\t${A}`]],
  ['a modification of a file in a sub folder', [edit(`${C020}/sub/c.txt`), stage(`${C020}/sub/c.txt`), commit], [`M\t${C020}/sub/c.txt`]],
  ['a mode change', [mode(A)], [`M\t${A}`]],
  ['a committed modification next to a committed addition', [make(NEW), edit(A), stage(NEW, A), commit], [`M\t${A}`]],
  ['a deletion in the working tree', [drop(A)], [`D\t${A}`]],
  ['a staged deletion', [drop(A), stage(A)], [`D\t${A}`]],
  ['a committed deletion', [drop(A), stage(A), commit], [`D\t${A}`]],
  ['a deletion hidden next to a committed addition', [drop(A), make(NEW), stage(A, NEW), commit], [`D\t${A}`]],
  ['a staged rename inside C020', [move(A, `${C020}/renamed.js`)], [`D\t${A}`]],
  ['a committed rename inside C020', [move(A, `${C020}/renamed.js`), commit], [`D\t${A}`]],
  ['a committed rename with an edit', [move(A, `${C020}/renamed.js`), edit(`${C020}/renamed.js`), stage(`${C020}/renamed.js`), commit], [`D\t${A}`]],
  ['a committed move out of C020', [move(A, 'other/a.js'), commit], [`D\t${A}`]]
];
const fixture = {};
before(() => {
  fixture.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'u032-drift-'));
  git(fixture.dir, 'init', '--quiet');
  for (const [relative, text] of [[A, 'alpha\n'], [`${C020}/b.js`, 'beta\n'], [`${C020}/sub/c.txt`, 'gamma\n'], ['other/outside.txt', 'outside\n']]) put(fixture.dir, relative, text);
  git(fixture.dir, 'add', '--', 'capability', 'other');
  git(fixture.dir, 'commit', '--quiet', '-m', 'accepted');
  fixture.accepted = git(fixture.dir, 'rev-parse', 'HEAD').trim();
});
after(() => fs.rmSync(fixture.dir, { recursive: true, force: true }));
for (const [name, steps, expected] of scenarios) {
  test(`drift of the accepted tree: ${name} ${expected.length ? 'is reported' : 'is accepted'}`, () => {
    git(fixture.dir, 'reset', '--quiet', '--hard', fixture.accepted);
    git(fixture.dir, 'clean', '--quiet', '-fd');
    for (const apply of steps) apply(fixture.dir);
    assert.deepEqual(amendments.c020Drift({ cwd: fixture.dir, commit: fixture.accepted, env: cleanEnv }), expected);
  });
}

test('the drift check fails closed when git cannot answer', () => {
  refuses(() => amendments.c020Drift({ cwd: fixture.dir, commit: '0'.repeat(40), env: cleanEnv }), 'DRIFT_GIT_FAILED');
  refuses(() => amendments.c020Drift({ cwd: path.join(fixture.dir, 'missing'), commit: fixture.accepted, env: cleanEnv }), 'DRIFT_GIT_FAILED');
});

test('the drift check reads the git answer strictly: status 1 always reports, any other status than 0 or 1 is an error', () => {
  const answer = (status, stdout = '', extra = {}) => () => ({ status, stdout, stderr: '', ...extra });
  const drift = (run) => amendments.c020Drift({ cwd: '.', commit: 'abc', run });
  assert.deepEqual(drift(answer(0)), []);
  assert.deepEqual(drift(answer(1, 'D\tcapability/C020/a.js\n\n')), ['D\tcapability/C020/a.js']);
  assert.equal(drift(answer(1)).length, 1);
  refuses(() => drift(answer(128, '', { stderr: 'fatal: bad object' })), 'DRIFT_GIT_FAILED', 'bad object');
  refuses(() => drift(answer(null, '', { error: new Error('spawn failed') })), 'DRIFT_GIT_FAILED', 'spawn failed');
});
