'use strict';

// U005 fix evidence integrity (rev-U005 F6): iterates EVERY manifest of EVERY capture of evidence\u005-fix, recomputes transcripts and hashes, pins the final runs
// (README-U005.md and U005.feature included) to the bytes they ran on, checks that the RED fails on assertions about the specified behavior, recomputes
// every figure that README-U005.md states from the stored evidence, and proves by tampering in a scratch copy that each kind of edit fails BY NAME.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { repoRoot, readManifest, stdoutOf, sha256, crlfToLf } = require('./u005-support-evidence.cjs');
assert.equal(sha256(crlfToLf(fs.readFileSync(path.join(__dirname, 'u006-u062-evidence-v4.cjs')))), '6006c81b4f2545f44c68190be486583a044985e01fb94bd0e54a8ffee203ad45', 'U062_EVIDENCE_HELPER_PIN');
const { verifyRun } = require('./u006-u062-evidence-v4.cjs');

const T = { timeout: 120000 };
const lifecycle = path.join(repoRoot, 'testing', 'browser', 'lifecycle');
const root = path.join(lifecycle, 'evidence', 'u005-fix');
const dirOf = (name) => path.join(root, name);
const HISTORY = ['red-1-first-publication'];
const KEPT_FAILED = ['real-1', 'real-2'];
const KEPT_FAILURES = {
  'real-1': 'real Edge: a forced expiry ends the launched tree, a same-image look-alike and the owner browser survive',
  'real-2': 'real Edge: two live sessions, the first is closed and ended twice, the second browser keeps running and answering',
};
const FINAL_REDS = ['red-2-final'];
const GREENS = ['green-1-suite', 'green-2-coverage-owned', 'green-3-coverage-startup'];
const FINAL_RUNS = [...FINAL_REDS, ...GREENS, 'mutation-1', 'real-3'];
const INTEGRITY = 'green-4-integrity';
const ALL = [...HISTORY, ...KEPT_FAILED, ...FINAL_RUNS];
const PINNED_DOCS = ['U005.feature', 'README-U005.md'];
const readme = () => fs.readFileSync(path.join(lifecycle, 'README-U005.md'), 'utf8').replace(/\r\n/g, '\n');
const observations = () => [...stdoutOf(dirOf('real-3'), 'real-3').matchAll(/^# U005-REAL-OBSERVATION (.+)$/gm)].map((match) => JSON.parse(match[1]));
const mutationReport = () => JSON.parse(stdoutOf(dirOf('mutation-1'), 'mutation-1'));
const rowOf = (name, file) => readManifest(dirOf(name), name).summary.coverageRows.find((row) => row.file === file);

// Every figure README-U005.md states, derived from the stored evidence only.
function figures() {
  const suite = readManifest(dirOf('green-1-suite'), 'green-1-suite').summary;
  const red = readManifest(dirOf('red-1-first-publication'), 'red-1-first-publication').summary;
  const mutants = mutationReport().summary;
  const [forced, normal, two] = observations();
  const cover = (name, file) => { const row = rowOf(name, file); return `${row.lines} / ${row.branches} / ${row.functions}`; };
  return [
    ['hermetic tests of the whole U005 suite', `${suite.pass} of ${suite.tests}`],
    ['coverage owned.cjs lines / branches / functions', cover('green-2-coverage-owned', 'owned.cjs')],
    ['coverage startup.cjs lines / branches / functions', cover('green-3-coverage-startup', 'startup.cjs')],
    ['fix RED against the first-publication bytes', `${red.fail} of ${red.tests} fail`],
    ['systematic mutants of owned.cjs and startup.cjs', `${mutants.total} generated, ${mutants.killed} killed, ${mutants.equivalent} equivalent with a proof, ${mutants.survived} survived`],
    ['real forced expiry (real-3): distinct owned identities', `${forced.distinctIdentities} (${forced.survivors} survivors)`],
    ['real normal open (real-3): recorded processes, roots', `${normal.recorded}, ${normal.roots}`],
    ['real two live sessions (real-3): recorded A, recorded B', `${two.recordedA}, ${two.recordedB}`],
  ];
}

test('the fix evidence folder holds exactly the archived runs and the first-publication snapshot', T, () => {
  const present = fs.readdirSync(root).filter((name) => name !== '.gitattributes' && name !== INTEGRITY).sort();
  assert.deepEqual(present, [...ALL, 'first-publication'].sort());
  assert.equal(fs.readFileSync(path.join(root, '.gitattributes'), 'utf8').trim(), '* -text -diff');
  for (const name of ALL) {
    assert.deepEqual(fs.readdirSync(dirOf(name)).sort(), ['raw', `${name}.json`].sort(), name);
    assert.deepEqual(fs.readdirSync(path.join(dirOf(name), 'raw')).sort(), [`${name}.stderr.raw.gz`, `${name}.stdout.raw.gz`], name);
  }
});

test('every archived run of the fix verifies: transcripts, hashes, exit codes and summaries', T, () => {
  for (const name of ALL.filter((item) => !KEPT_FAILED.includes(item))) assert.deepEqual(verifyRun(dirOf(name), name), [], name);
  for (const name of KEPT_FAILED) assert.deepEqual(verifyRun(dirOf(name), name, { expectedExitCode: 1 }), [], name);
  for (const name of [...HISTORY, ...FINAL_REDS, ...KEPT_FAILED]) assert.equal(readManifest(dirOf(name), name).exitCode, 1, name);
  for (const name of [...GREENS, 'mutation-1', 'real-3']) assert.equal(readManifest(dirOf(name), name).exitCode, 0, name);
  for (const [name, title] of Object.entries(KEPT_FAILURES)) {
    const failed = readManifest(dirOf(name), name).summary;
    assert.deepEqual([failed.tests, failed.pass, failed.fail], [3, 2, 1], `${name}: the kept failed real run, two of three tests passed`);
    assert.deepEqual(failed.notOk, [title], name);
  }
  assert.match(stdoutOf(dirOf('real-2'), 'real-2'), /code: 'EBUSY'/, 'real-2 failed on a scratch-removal EBUSY of the sealed close, not on a process fact');
});

test('every final run pins the exact bytes of every file it ran on, and the specification and README are among them', T, () => {
  for (const name of FINAL_RUNS) assert.deepEqual(verifyRun(dirOf(name), name, { pinInputs: true }), [], name);
  for (const name of [...FINAL_REDS, ...GREENS]) {
    const inputs = readManifest(dirOf(name), name).inputs.map((input) => path.basename(input.path));
    for (const doc of PINNED_DOCS) assert.ok(inputs.includes(doc), `${name} pins ${doc}`);
  }
  assert.ok(readManifest(dirOf('mutation-1'), 'mutation-1').inputs.some((input) => /mutate-lex\.cjs$/.test(input.path)));
});

test('the RED fails on assertions about the specified behavior and names a failing test for every finding F1, F2, F3, F4 and F7', T, () => {
  for (const name of [...HISTORY, ...FINAL_REDS]) {
    const manifest = readManifest(dirOf(name), name);
    const text = stdoutOf(dirOf(name), name);
    assert.ok(manifest.summary.fail >= 15 && manifest.summary.tests >= 20, `${name}: ${manifest.summary.fail} of ${manifest.summary.tests}`);
    assert.ok((text.match(/code: 'ERR_ASSERTION'/g) || []).length >= 12, `${name}: assertion failures`);
    assert.doesNotMatch(text, /Cannot find module|MODULE_NOT_FOUND|SyntaxError/, name);
    for (const finding of ['F1', 'F2', 'F3', 'F4', 'F7']) assert.ok(manifest.summary.notOk.some((item) => item.startsWith(`${finding} `) || item.startsWith(`${finding}:`)), `${name}: a failing test for ${finding}`);
  }
});

test('the GREEN suite passes every test, the per-file rows are at least 85/85/85 and the RED tests ran unchanged inside it', T, () => {
  const suite = readManifest(dirOf('green-1-suite'), 'green-1-suite');
  assert.deepEqual([suite.summary.pass, suite.summary.fail, suite.summary.skipped, suite.summary.cancelled], [suite.summary.tests, 0, 0, 0]);
  assert.ok(suite.summary.tests >= 100);
  for (const [name, file] of [['green-2-coverage-owned', 'owned.cjs'], ['green-3-coverage-startup', 'startup.cjs']]) {
    const rows = readManifest(dirOf(name), name).summary.coverageRows.filter((row) => row.file === file);
    assert.equal(rows.length, 1, name);
    assert.ok(rows[0].lines >= 85 && rows[0].branches >= 85 && rows[0].functions >= 85, JSON.stringify(rows[0]));
  }
  const red = readManifest(dirOf('red-2-final'), 'red-2-final').inputs;
  for (const input of red.filter((item) => /u005-fix-.*\.test\.cjs$/.test(item.path))) {
    assert.equal(suite.inputs.find((item) => item.path === input.path).crlfToLfSha256, input.crlfToLfSha256, `${input.path} is the same test in the RED and in the GREEN`);
  }
});

test('systematic mutation: every statement and condition was mutated, nothing survives unexplained, every equivalent carries a proof', T, () => {
  const report = mutationReport();
  assert.equal(report.control.ok, true);
  assert.ok(report.summary.total >= 600);
  assert.deepEqual(report.summary.unexplained, []);
  assert.equal(new Set(report.mutants.map((mutant) => mutant.id)).size, report.mutants.length);
  assert.deepEqual([...new Set(report.mutants.map((mutant) => mutant.file))].sort(), ['owned.cjs', 'startup.cjs']);
  for (const mutant of report.mutants) {
    assert.ok(['killed', 'killed-by-crash', 'equivalent'].includes(mutant.status), mutant.id);
    if (mutant.status === 'equivalent') assert.ok(typeof mutant.proof === 'string' && mutant.proof.length >= 25, `${mutant.id} has a proof`);
    if (mutant.status === 'killed') assert.ok(mutant.failing.length >= 1, mutant.id);
  }
  const guards = [['!this.#sealed', /^F1/], ['this.#sealed = true', /^F1/], ['watcher.aborted', /^F2/]];
  for (const [needle, expected] of guards) {
    const named = report.mutants.filter((mutant) => mutant.original.includes(needle) && mutant.status === 'killed');
    assert.ok(named.length >= 1 && named.some((mutant) => mutant.failing.some((item) => expected.test(item))), `the guard ${needle} has a mutant killed by a ${expected} test`);
  }
});

test('real Edge evidence: signed and qualified, two live sessions, no foreign process touched, identities counted once', T, () => {
  const lines = observations();
  assert.equal(lines.length, 3);
  const majors = require(path.join(repoRoot, 'testing', 'browser', 'qualify', 'adapters.cjs')).readQualified().qualifiedMajors;
  for (const line of lines) {
    assert.equal(line.edge.status, 'Valid');
    assert.match(line.edge.subject, /O=Microsoft Corporation/);
    assert.ok(majors.includes(Number(line.edge.version.split('.')[0])));
  }
  const [forced, normal, two] = lines;
  assert.equal(forced.survivors, 0);
  assert.equal(forced.finalClean, true);
  assert.equal(forced.distinctIdentities, forced.terminated + forced.alreadyGone + forced.survivors, 'the identities are counted once');
  assert.deepEqual(forced.foreignVanished, []);
  assert.ok(normal.recorded >= 1 && normal.roots >= 1 && normal.killRequests === 0);
  assert.equal(two.scenario, 'two-live-sessions-fifo');
  assert.equal(two.bRootAliveAfterFirstEnd && two.bTitleAfterFirstEnd, true);
  assert.equal(two.repeatedTerminateKillRequests, 0);
  assert.equal(two.killRequestsB, 0);
});

test('README-U005.md states exactly the figures the stored evidence shows', T, () => {
  const text = readme();
  for (const [label, value] of figures()) assert.ok(text.includes(`| ${label} | ${value} |`), `README row: ${label} = ${value}`);
});

test('the README figures table holds exactly the rows the evidence recomputes: a new row fails until it is compared', T, () => {
  const lines = readme().split('\n');
  const start = lines.findIndex((line) => line === '| Figure | Value |');
  assert.ok(start >= 0, 'the figures table exists');
  const body = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    body.push(line);
  }
  assert.deepEqual(body.map((line) => line.split('|')[1].trim()).sort(), figures().map(([label]) => label).sort());
});

// Checklist 5: nothing a caller receives from an owned tree is shared with the tree (a walker mutates every reachable object in strict mode).
function mutateEverything(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!('value' in descriptor)) continue;
    mutateEverything(descriptor.value, seen);
    try { value[key] = 'MUTATED'; } catch { /* a frozen value refuses, which is also a copy-safe answer */ }
  }
  if (Array.isArray(value)) {
    try { value.push('MUTATED'); value.length = 0; } catch { /* frozen */ }
  }
}

test('every public return value of an owned tree is a copy: mutating all of it changes nothing later', T, async () => {
  const { World, recorded, drive, settle } = require('./u005-support-world.cjs');
  const world = new World();
  const { owned: tree } = await recorded(world, 'navigation');
  const view = () => { const snapshot = tree.snapshot(); delete snapshot.capturedAtMs; return JSON.stringify({ recorded: tree.recorded(), roots: tree.roots, unverifiable: tree.unverifiable, snapshot }); };
  const before = view();
  for (const value of [tree.recorded(), tree.roots, tree.unverifiable, tree.snapshot()]) mutateEverything(value);
  assert.equal(view(), before, 'the views of the tree are unchanged');
  const shape = (report) => JSON.stringify({ terminated: [...report.terminated].sort((a, b) => a.pid - b.pid), alreadyGone: [...report.alreadyGone].sort((a, b) => a.pid - b.pid), survivors: report.survivors, clean: report.clean });
  const first = (await drive(world.clock, settle(tree.terminate()))).value.value;
  const expected = shape(first);
  mutateEverything(first);
  const second = (await drive(world.clock, settle(tree.terminate()))).value.value;
  assert.equal(shape(second), expected, 'a second report is not influenced by what the caller did to the first');
  assert.equal(first.terminated, 'MUTATED', 'the walker did overwrite the first report (the check is not vacuous)');
});

// Controller note (U018 addendum): the sealed list of qualified Edge majors is never read directly, readQualified() of testing\browser\qualify
// merges it with its append-only addendum. The scan covers every source and test of U005 (the U006 files carry the same guard in U006's commit).
test('no U005 source or test names the sealed qualified-majors file outside a comment', T, () => {
  const { lex } = require('./mutate-lex.cjs');
  const needle = ['qualified', 'json'].join('.');
  const inCode = (text) => lex(text).filter((token) => token.type !== 'ws' && token.type !== 'comment').filter((token) => token.text.includes(needle));
  const tests = path.join(lifecycle, 'tests');
  const files = [path.join(lifecycle, 'owned.cjs'), path.join(lifecycle, 'startup.cjs'), ...fs.readdirSync(tests).filter((name) => /^(u005-|mutate-).*\.cjs$/.test(name)).map((name) => path.join(tests, name))];
  assert.ok(files.length >= 15, `scanned ${files.length} files`);
  for (const file of files) {
    const hits = inCode(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(hits.map((token) => token.text.slice(0, 80)), [], `${path.relative(lifecycle, file)} names ${needle} in code`);
  }
  assert.equal(inCode(`const f = '../qualify/${needle}';`).length, 1, 'a name in a string is found');
  assert.equal(inCode('const t = `x/' + needle + '`;').length, 1, 'a name in a template is found');
  assert.equal(inCode(`// ${needle}\n/* ${needle} */ const x = 1;`).length, 0, 'a name in a comment is not an access');
});

function withScratch(run) {
  const dir = fs.mkdtempSync(path.join(__dirname, 'u005-fix-tamper-'));
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('tampering is detected BY NAME: a README byte, a feature byte, a production byte, a test byte, a transcript byte, an edited manifest, an edited pin', T, () => {
  const name = 'green-1-suite';
  withScratch((dir) => {
    const copy = path.join(dir, name);
    fs.cpSync(dirOf(name), copy, { recursive: true });
    const manifest = readManifest(copy, name);
    const rootDir = path.join(dir, 'root');
    for (const input of manifest.inputs) {
      fs.mkdirSync(path.dirname(path.join(rootDir, input.path)), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, input.path), path.join(rootDir, input.path));
    }
    const options = { pinInputs: true, root: rootDir };
    assert.deepEqual(verifyRun(copy, name, options), []);
    for (const needle of ['README-U005.md', 'U005.feature', 'owned.cjs', 'startup.cjs', 'u005-fix-ownership.test.cjs']) {
      const input = manifest.inputs.find((item) => item.path.endsWith(needle));
      const file = path.join(rootDir, input.path);
      const original = fs.readFileSync(file);
      const flipped = Buffer.from(original);
      flipped[Math.floor(flipped.length / 2)] ^= 0x01;
      fs.writeFileSync(file, flipped);
      assert.ok(verifyRun(copy, name, options).some((item) => item.includes(`${needle} changed after the run`)), `a byte of ${needle}`);
      fs.writeFileSync(file, original);
    }
    const gz = path.join(copy, 'raw', `${name}.stdout.raw.gz`);
    const bytes = fs.readFileSync(gz);
    bytes[bytes.length - 12] ^= 0xff;
    fs.writeFileSync(gz, bytes);
    assert.ok(verifyRun(copy, name).some((item) => /stdout/.test(item)), 'a transcript byte');
    fs.cpSync(path.join(dirOf(name), 'raw', `${name}.stdout.raw.gz`), gz);
    const file = path.join(copy, `${name}.json`);
    const forged = { ...manifest, inputs: manifest.inputs.map((input, index) => (index === 0 ? { ...input, crlfToLfSha256: '0'.repeat(64) } : input)) };
    fs.writeFileSync(file, JSON.stringify(forged));
    assert.ok(verifyRun(copy, name, options).some((item) => item.includes(`${manifest.inputs[0].path} changed after the run`)), 'a forged pin');
    fs.writeFileSync(file, JSON.stringify({ ...manifest, exitCode: 1 }));
    assert.ok(verifyRun(copy, name).some((item) => /exit 1/.test(item)), 'an edited manifest');
  });
});

test('the first-publication snapshot is what the manifests say and what git published when the object database is available', T, () => {
  const snapshot = JSON.parse(fs.readFileSync(path.join(dirOf('first-publication'), 'first-publication.json'), 'utf8'));
  const red = readManifest(dirOf('red-1-first-publication'), 'red-1-first-publication').inputs;
  for (const file of snapshot.files) {
    const bytes = fs.readFileSync(path.join(dirOf('first-publication'), file.snapshot));
    assert.equal(sha256(bytes), file.sha256);
    assert.equal(bytes.length, file.bytes);
    assert.ok(!bytes.includes(13), 'the snapshot holds LF bytes');
    assert.equal(red.find((item) => item.path.endsWith(file.snapshot)).crlfToLfSha256, file.sha256, 'the RED ran on this snapshot');
    const probe = require('node:child_process').spawnSync('git', ['-C', repoRoot, 'cat-file', 'blob', `${snapshot.commit}:${file.path}`], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    if (probe.status === 0) assert.equal(sha256(crlfToLf(probe.stdout)), file.sha256, `${file.path} is the blob of ${snapshot.commit}`);
  }
});
