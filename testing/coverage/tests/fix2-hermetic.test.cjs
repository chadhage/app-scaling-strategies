'use strict';

// N2, N5, N6, N8, N9 and N11 of the second independent review of U009, tested as BLACK BOXES: the real evidence test file is run in copies of the namespace
// (no capability/C031, no .git; evidence deleted or edited) and its exit status is the answer.
// While the final archives are being recorded the evidence is incomplete by design: U009_EVIDENCE_CAPTURE=1 then skips ONLY the checks that need the complete
// set (here: the tamper cases). The default is strict, and the archive of the final GREEN run is recorded without the variable.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runProcess } = require('../runner.cjs');
const { buildEnvironment } = require('../command.cjs');
const { makeScratch, dispose } = require('./support.cjs');

const namespace = path.resolve(__dirname, '..');
const capturing = process.env.U009_EVIDENCE_CAPTURE === '1';
// A hang detector for the nested test run, far above any load of a shared machine: the evidence checks read about one megabyte.
const HANG_DEADLINE_MS = 300000;

// A plain recursive copy: fs.cpSync refuses a destination below its own source, and the scratch folders live below the namespace.
function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === '.scratch') continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function copyNamespace(base) {
  const target = path.join(base, 'testing', 'coverage');
  copyTree(namespace, target);
  return target;
}

async function runEvidenceTest(copy) {
  const run = await runProcess({
    command: process.execPath, args: ['--test', '--test-concurrency=1', path.join(copy, 'tests', 'evidence.test.cjs')], cwd: path.dirname(path.dirname(copy)),
    env: buildEnvironment(process.env, {}), timeoutMs: HANG_DEADLINE_MS
  });
  assert.equal(run.timedOut, false, `the nested evidence test hung: it was still running after ${HANG_DEADLINE_MS / 1000} seconds`);
  return { ...run, text: `${run.stdout}\n${run.stderr}` };
}

const directoriesOf = (directory) => (fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort() : []);

function manifestsBelow(directory) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'raw') found.push(...manifestsBelow(full));
    else if (entry.isFile() && entry.name.endsWith('.json')) found.push(full);
  }
  return found;
}

// The newest generation of final archives and the REDs that belong to it (fix2 after this fix round, fix before it).
function newestGeneration(copy) {
  const generation = directoriesOf(path.join(copy, 'evidence')).includes('fix2') ? 'fix2' : 'fix';
  const reds = directoriesOf(path.join(copy, 'evidence', 'red')).filter((name) => name.startsWith(`${generation}-`));
  return { generation, directory: path.join(copy, 'evidence', generation), reds: reds.map((name) => path.join(copy, 'evidence', 'red', name)) };
}

test('N2: the evidence test passes in a copy of the namespace without capability/C031 and without .git', async (t) => {
  const base = makeScratch('h-copy');
  t.after(() => dispose(base));
  const copy = copyNamespace(base);
  assert.deepEqual([fs.existsSync(path.join(base, 'capability')), fs.existsSync(path.join(base, '.git'))], [false, false]);
  const run = await runEvidenceTest(copy);
  assert.equal(run.status, 0, run.text.slice(-4000));
  assert.match(run.text, /# fail 0/);
});

const tampers = [
  ['the self-gate archives are deleted', /self-gate/, (copy) => {
    const gone = manifestsBelow(path.join(copy, 'evidence')).filter((file) => path.basename(file).startsWith('self-gate-'));
    assert.equal(gone.length > 0, true, 'there is a self-gate archive to delete');
    for (const file of gone) fs.rmSync(file);
  }],
  ['a replay archive is deleted', /replay/, (copy) => {
    const [first] = manifestsBelow(newestGeneration(copy).directory).filter((file) => path.basename(file).startsWith('replay-'));
    assert.notEqual(first, undefined, 'there is a replay archive to delete');
    fs.rmSync(first);
  }],
  ['the whole newest generation of final archives is deleted', /fix2?\b/, (copy) => fs.rmSync(newestGeneration(copy).directory, { recursive: true, force: true })],
  ['a RED archive of the newest generation is deleted', /red|fix/, (copy) => {
    const [first] = newestGeneration(copy).reds;
    assert.notEqual(first, undefined, 'there is a RED archive to delete');
    fs.rmSync(first, { recursive: true, force: true });
  }],
  ['the README is edited without touching the pins', /README/, (copy) => fs.appendFileSync(path.join(copy, 'README.md'), '\nAn extra paragraph that no archive has seen.\n')]
];

for (const [label, pattern, tamper] of tampers) {
  test(`N5: the evidence test fails when ${label}`, { skip: capturing ? 'the archives are being recorded (U009_EVIDENCE_CAPTURE=1)' : false }, async (t) => {
    const base = makeScratch('h-tamper');
    t.after(() => dispose(base));
    const copy = copyNamespace(base);
    tamper(copy);
    const run = await runEvidenceTest(copy);
    assert.notEqual(run.status, 0, 'a missing or changed archive must fail the suite, not skip');
    assert.match(run.text, /# fail [1-9]/);
    assert.equal(/# skipped [1-9]/.test(run.text), false, 'and it must not be a skip');
    assert.match(run.text, pattern);
  });
}

test('N8: every test starts the gate through the tree-killing runGateCli, and no helper ends only the gate pid after a timer', () => {
  const support = require('./support.cjs');
  assert.equal('runCli' in support, false, 'support.cjs no longer offers the pid-only runner');
  const sources = fs.readdirSync(__dirname).filter((name) => name.endsWith('.cjs')).map((name) => [name, fs.readFileSync(path.join(__dirname, name), 'utf8')]);
  assert.equal(sources.length >= 10, true);
  for (const [name, text] of sources) assert.doesNotMatch(text, /setTimeout\(\(\) => \w+\.kill\(\)/, `${name} ends only a child pid after a timer`);
  assert.match(sources.find(([name]) => name === 'e2e.test.cjs')[1], /runGateCli/);
});

test('N3, N6, N9 and N11: the README says what the code does, states the costs and limits, and names the strict mode', () => {
  const readme = fs.readFileSync(path.join(namespace, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /one test is skipped/, 'N6a: the suite no longer skips a test unless U009_EVIDENCE_CAPTURE=1');
  assert.doesNotMatch(readme, /The path never keeps an older result/, 'N6b: untrue for a file the gate can neither replace nor remove');
  assert.doesNotMatch(readme, /can make the enumeration hang/, 'N6c: overclaim');
  assert.match(readme, /linear in entries x files x pattern length x path length/, 'N6c: the cost is stated');
  assert.match(readme, /no cap on the number of manifest entries/);
  assert.match(readme, /`fullBar` ignores `--manifest`/, 'N6d');
  assert.match(readme, /`--json=<path>`/, 'N3: the spellings are listed');
  assert.match(readme, /does not sanitize `NODE_OPTIONS`[^\n]*foreign `NODE_OPTIONS`/s, 'N9: U013 and every caller must not run the gate under a foreign NODE_OPTIONS');
  assert.match(readme, /72 to 172 s/, 'N11: the timing hint');
  assert.match(readme, /strict-evidence\.cjs/, 'N2: the explicit strict mode is named');
  assert.match(readme, /U009_EVIDENCE_CAPTURE/, 'N5: the capture switch is named');
  assert.match(readme, /consistent rewrite of the README, the tests and the pins is not detectable/, 'N5: the honest limit');
});
