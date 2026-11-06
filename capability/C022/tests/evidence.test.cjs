'use strict';

// The archived evidence of C022: every manifest is recomputed (transcripts, pinned inputs, exit codes), the seal pins the final bytes, the
// README states only figures that the evidence shows, and a TAMPER test per kind of evidence proves that an altered byte is detected BY NAME.
// A consistent rewrite of a manifest plus its inputs plus the seal is not detectable here: the published commit and tag are the anchor.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { test } = require('node:test');
const { lf, manifestsOf, readManifest, sha, verify, walk } = require('./evidence-verify.cjs');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const only = (dir, prefix) => manifestsOf(root).filter(({ file }) => file.startsWith(path.join(root, 'evidence', dir)) && path.basename(file).startsWith(prefix));
const serial = (entry) => Number(/-(\d+)\.json$/.exec(entry.file)[1]);
// The CURRENT capture of a kind is the highest serial: the first RED cycle (red-1, replay-1) is retained next to the final one (red-2, replay-2).
const latest = (dir, prefix) => only(dir, prefix).sort((left, right) => serial(left) - serial(right)).at(-1);
const rows = (manifest) => manifest.summary.coverageRows;
const DOT_TEST = /\.test\.cjs$/;

test('every archived manifest recomputes: transcripts, pinned inputs, exit codes, and the seal over the final bytes', () => {
  assert.deepEqual(verify(root), []);
});

test('the RED is behavioral: it failed on the retained naive stub with assertion errors about the specified behavior, not a missing module', () => {
  const red = latest('red', 'red-');
  assert.ok(red, 'a RED archive exists');
  assert.equal(red.json.exitCode, 1);
  assert.ok(red.json.summary.fail > 100, `many specified behaviors fail on the naive stub (${red.json.summary.fail})`);
  assert.equal(red.json.environmentAdded.includes('C022_SUBJECT_DIR'), true);
  const stdout = zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(red.file), red.json.transcripts.stdout.path))).toString('utf8');
  assert.ok((stdout.match(/ERR_ASSERTION/g) || []).length >= red.json.summary.fail * 0.8, 'the failures are assertions');
  assert.doesNotMatch(stdout, /Cannot find module|ERR_MODULE_NOT_FOUND|SyntaxError|ReferenceError/);
  assert.ok(red.json.inputs.some((input) => input.path.endsWith('evidence\\red\\stub\\server.cjs')), 'the stub is pinned');
  assert.ok(red.json.inputs.some((input) => input.path.endsWith('C022.feature')));
  assert.ok(red.json.command.some((arg) => arg.endsWith('pending-flood.test.cjs')), 'the pending-first-request flood (rev-C017 F24) is part of the RED');
});

test('the RED replays UNCHANGED against the final code and passes: the same files, the same command, no subject override', () => {
  const red = latest('red', 'red-');
  const replay = latest('red', 'replay-');
  assert.ok(replay, 'a replay archive exists');
  assert.equal(serial(replay), serial(red), 'the replay belongs to the same cycle as the RED');
  assert.deepEqual(replay.json.command.filter((arg) => DOT_TEST.test(arg)), red.json.command.filter((arg) => DOT_TEST.test(arg)));
  assert.equal(replay.json.environmentAdded, undefined, 'no C022_SUBJECT_DIR: the final code');
  assert.equal(replay.json.exitCode, 0);
  assert.equal(replay.json.summary.fail, 0);
  assert.equal(replay.json.summary.cancelled, 0);
  assert.equal(replay.json.summary.pass, replay.json.summary.tests);
  const names = (manifest, pattern) => {
    const text = zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(manifest.file), manifest.json.transcripts.stdout.path))).toString('utf8').replaceAll('\r\n', '\n');
    return new Set([...text.matchAll(pattern)].map((match) => match[1].trim()).filter((name) => !name.endsWith('.cjs')));
  };
  const redNames = names(red, /^(?:not )?ok \d+ - (.+)$/gm);
  const replayPassed = names(replay, /^ok \d+ - (.+)$/gm);
  assert.ok(redNames.size > 100);
  assert.deepEqual([...redNames].filter((name) => !replayPassed.has(name)), [], 'every test that ran in the RED exists and passes in the replay');
});

test('the first RED cycle is retained exactly as archived: its manifests are listed, the bytes of every input that changed since are kept, nothing else is', () => {
  const listed = readManifest(root, 'red/superseded.json');
  assert.deepEqual(listed.manifests.slice().sort(), ['evidence/red/replay-1/replay-1.json', 'evidence/red/run-1/red-1.json']);
  const retained = [only('red', 'red-'), only('red', 'replay-')].flat().filter((entry) => serial(entry) === 1);
  assert.equal(retained.length, 2);
  const [first] = retained.filter((entry) => path.basename(entry.file).startsWith('red-'));
  assert.equal(first.json.exitCode, 1);
  assert.equal(first.json.summary.tests, 303);
  assert.equal(first.json.summary.fail, 292);
  const [firstReplay] = retained.filter((entry) => path.basename(entry.file).startsWith('replay-'));
  assert.equal(firstReplay.json.summary.pass, 396);
  const changed = new Set();
  for (const { json } of retained) {
    for (const input of json.inputs) {
      const live = path.join(root, '..', '..', input.path);
      if (!fs.existsSync(live) || (sha(fs.readFileSync(live)) !== input.rawSha256 && sha(lf(fs.readFileSync(live))) !== input.crlfToLfSha256)) changed.add(path.win32.basename(input.path));
    }
  }
  const kept = fs.readdirSync(path.join(root, listed.snapshotDir)).filter((name) => name.endsWith('.snap')).map((name) => name.slice(0, -'.snap'.length));
  assert.deepEqual(kept.sort(), [...changed].sort(), 'a snapshot is kept for exactly the inputs that changed since the first RED cycle');
  assert.ok(kept.includes('pipeline.test.cjs') && kept.includes('pipeline-process.test.cjs') && kept.includes('C022.feature'));
});

test('GREEN: every test of the suite passed with nothing skipped, cancelled or left todo', () => {
  const [green] = only('green', 'green-');
  assert.ok(green);
  const { summary } = green.json;
  assert.ok(summary.tests > 400);
  assert.equal(summary.pass, summary.tests);
  assert.deepEqual([summary.fail, summary.cancelled, summary.skipped || 0, summary.todo || 0], [0, 0, 0, 0]);
  const files = new Set(green.json.command.filter((arg) => arg.endsWith('.test.cjs')));
  const onDisk = fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.cjs') && name !== 'evidence.test.cjs').map((name) => `capability\\C022\\tests\\${name}`);
  assert.deepEqual([...files].sort(), onDisk.sort(), 'the GREEN run enumerated every test file but this one (it verifies the archive, which the GREEN run produces)');
  // This file's own run (verify-1) is recorded AFTER the seal by the recorder and is verified as a manifest like any other; while that run is
  // being recorded it cannot exist yet, so it is checked only when it is there.
  const [verifyRun] = only('green', 'verify-');
  if (verifyRun) {
    assert.deepEqual(verifyRun.json.command.filter((arg) => arg.endsWith('.test.cjs')), ['capability\\C022\\tests\\evidence.test.cjs']);
    assert.equal(verifyRun.json.summary.fail, 0);
  }
});

// The cost rule: every raw-socket or process-spawning file runs 20 times, 4 at a time, under 4 CPU burners that the loop started (PIDs recorded,
// normal priority). A failing run is a defect. A run over the runner's 60 s per-file cap under that load is a FINDING, never hidden: the figures are
// recorded in the manifest and the README states them.
const LOOPED = ['imports', 'pending-flood', 'pipeline-earlier', 'pipeline-http10', 'pipeline-one-write', 'pipeline-process-rows', 'pipeline-process-third-hole', 'pipeline-third-hole', 'pipeline-two-writes', 'races', 'refusal-close', 'refusal-flood'];
const loopFigures = () => {
  const [file] = walk(path.join(root, 'evidence', 'loops')).filter((candidate) => candidate.endsWith('.json'));
  const loop = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entries = Object.entries(loop.perFile);
  const slowest = entries.reduce((best, entry) => (entry[1].maxMs > best[1].maxMs ? entry : best));
  return { loop, runs: entries.reduce((sum, entry) => sum + entry[1].runs, 0), passed: entries.reduce((sum, entry) => sum + entry[1].passed, 0), overCap: entries.reduce((sum, entry) => sum + entry[1].overCap, 0), files: entries.length, slowest };
};

test('the load loop: every run of every raw-socket and process-spawning file passed under CPU burners that this card started (20 runs, 4 at a time)', () => {
  const loops = walk(path.join(root, 'evidence', 'loops')).filter((file) => file.endsWith('.json'));
  assert.equal(loops.length, 1, 'one loop archive');
  const { loop } = loopFigures();
  assert.ok(loop.burners >= 4 && loop.burnerPids.length === loop.burners, 'burners started by the loop, PIDs recorded');
  assert.ok(loop.parallel >= 4 && loop.rounds >= 20, `${loop.rounds} rounds, ${loop.parallel} at a time`);
  const spawning = fs.readdirSync(__dirname).filter((name) => DOT_TEST.test(name) && /child_process|proc\.cjs|matrix-kit\.cjs|raw\.cjs/.test(fs.readFileSync(path.join(__dirname, name), 'utf8'))).map((name) => name.replace(DOT_TEST, ''));
  const looped = Object.keys(loop.perFile).map((name) => name.replace(DOT_TEST, '')).sort();
  assert.deepEqual(looped, LOOPED, 'the loop covers the declared files');
  for (const name of spawning) assert.ok(looped.includes(name) || name === 'evidence', `${name} spawns a process or uses raw sockets, so it is looped`);
  for (const [name, figures] of Object.entries(loop.perFile)) {
    assert.equal(figures.passed, figures.runs, `${name}: every run passed`);
    assert.equal(figures.runs, loop.rounds, name);
  }
});

test('the fresh-checkout proofs: every test file but this one is green in a tree of LF bytes and in the same tree converted to CRLF', () => {
  for (const mode of ['lf', 'crlf']) {
    const run = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'fresh', `fresh-${mode}.json`), 'utf8'));
    assert.equal(run.mode, mode);
    assert.equal(run.exit, 0);
    assert.equal(run.fail, 0);
    assert.equal(run.cancelled, 0);
    assert.equal(run.pass, run.tests);
    assert.ok(run.tests > 400);
    assert.equal(run.files, fs.readdirSync(__dirname).filter((name) => DOT_TEST.test(name) && name !== 'evidence.test.cjs').length, 'every test file but this one ran in the tree (this one asserts these manifests)');
  }
});

test('per-file coverage: ONE L-0004 command per production file, a row for each, 85/85/85 at least, unloaded counts as zero', () => {
  const production = ['contract.js', 'identity.cjs', 'store.cjs', 'service.cjs', 'server.cjs', 'page.js'];
  assert.deepEqual(fs.readdirSync(root).filter((name) => /\.c?js$/.test(name)).sort(), production.slice().sort(), 'no unenumerated production file');
  for (const file of production) {
    const manifests = only('coverage', `cov-${file.replace('.', '-')}`);
    assert.equal(manifests.length, 1, file);
    const { json } = manifests[0];
    assert.ok(json.command.includes(`--test-coverage-include=**/C022/${file}`), file);
    assert.equal(json.command.filter((arg) => arg.startsWith('--test-coverage-include=')).length, 1, 'one file per command');
    for (const flag of ['--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85']) assert.ok(json.command.includes(flag));
    const row = rows(json).find((entry) => entry.file === file);
    assert.ok(row, `${file} has a coverage row (an unloaded file prints none)`);
    assert.ok(row.lines >= 85 && row.branches >= 85 && row.functions >= 85, `${file}: ${row.lines}/${row.branches}/${row.functions}`);
    assert.equal(json.exitCode, 0);
  }
});

// A mutant is identified by its file, its id and its replacement: the two mutants of one condition (to true, to false) share their id.
const mutantKey = (entry) => `${entry.file}:${entry.id}:${entry.to}`;
const mutationPasses = () => fs.readdirSync(path.join(root, 'evidence', 'mutants')).filter((name) => /^mutation-\d+\.json$/.test(name)).sort((left, right) => Number(/\d+/.exec(left)[0]) - Number(/\d+/.exec(right)[0]));

test('mutation: every generated mutant was run, every survivor and undecided mutant is listed (equivalent with a one-line proof, answered by a later test, or open), the rest were killed by a named test', () => {
  const names = mutationPasses();
  assert.ok(names.length >= 1, 'a mutation pass is archived');
  const run = readManifest(root, `mutants/${names.at(-1)}`);
  const equivalents = readManifest(root, 'mutants/equivalents.json');
  assert.equal(run.passes.length, names.length, 'the final manifest names every pass');
  assert.ok(run.baseline.length >= 20 && run.baseline.every((entry) => entry.status === 0), 'every test file passed on the unmutated tree before the first mutant (a failing file would kill everything)');
  const disk = fs.readdirSync(__dirname).filter((name) => DOT_TEST.test(name) && !['evidence.test.cjs', 'imports.test.cjs'].includes(name)).map((name) => name.replace(DOT_TEST, '')).sort();
  assert.deepEqual(Object.keys(run.testHashes).filter((name) => !disk.includes(name)), [], 'the final pass ran no test file that is gone (imports.test.cjs needs git, this file verifies the archive)');
  const added = disk.filter((name) => !Object.hasOwn(run.testHashes, name));
  for (const [name, hashes] of Object.entries(run.testHashes)) {
    const bytes = fs.readFileSync(path.join(__dirname, `${name}.test.cjs`));
    assert.ok(sha(bytes) === hashes.raw || sha(lf(bytes)) === hashes.lf, `${name}: the final mutation pass ran against these test bytes`);
  }
  for (const [file, hashes] of Object.entries(run.sourceHashes)) {
    const bytes = fs.readFileSync(path.join(root, file));
    assert.ok(sha(bytes) === hashes.raw || sha(lf(bytes)) === hashes.lf, `${file}: the mutants were made from these production bytes`);
  }
  let total = 0;
  for (const [file, figures] of Object.entries(run.summary)) {
    assert.equal(figures.killed + figures.survived + figures.undecided, figures.total, file);
    assert.equal(figures.total + figures.notRun, figures.generated, `${file}: what ran plus what did not run is what was generated`);
    assert.equal(figures.notRun, 0, `${file}: every generated mutant ran (a time-boxed partial run is not enough evidence)`);
    total += figures.total;
  }
  assert.equal(run.results.length, total);
  assert.ok(total >= 700, `a systematic run (${total} mutants)`);
  assert.equal(run.complete, Object.values(run.summary).every((figures) => figures.notRun === 0 && figures.undecided === 0));
  const open = run.results.filter((entry) => !entry.killedBy);
  assert.deepEqual(open.map(mutantKey).sort(), equivalents.map(mutantKey).sort(), 'every survivor and every undecided mutant is listed, and nothing else is');
  for (const entry of equivalents) {
    assert.ok(['equivalent', 'answered', 'open'].includes(entry.kind), `${mutantKey(entry)} is equivalent, answered or open`);
    assert.ok(entry.reason.length > 25 && !entry.reason.includes('\n'), `${mutantKey(entry)} needs a one-line reason`);
    if (entry.kind === 'answered') assert.ok(added.includes(entry.answeredBy), `${mutantKey(entry)}: answered by ${entry.answeredBy}, a test file that was added after the final pass`);
    else assert.equal(entry.answeredBy, undefined, `${mutantKey(entry)}: only an answered gap names a test`);
  }
  for (const name of added) assert.ok(equivalents.some((entry) => entry.answeredBy === name), `${name} was added after the final pass because of a listed gap`);
  for (const entry of run.results.filter((result) => result.undecided)) assert.notEqual(equivalents.find((item) => mutantKey(item) === mutantKey(entry)).kind, 'equivalent', 'a timeout or a hang is never an equivalent and never a kill');
  assert.ok(run.results.filter((entry) => entry.killedBy).every((entry) => entry.killedBy.test && entry.killedBy.file.endsWith('.test.cjs')), 'every kill names a test');
  for (const earlier of names.slice(0, -1)) {
    const before = readManifest(root, `mutants/${earlier}`);
    for (const entry of before.results.filter((result) => !result.killedBy)) {
      const now = run.results.find((result) => mutantKey(result) === mutantKey(entry));
      assert.ok(now, `${mutantKey(entry)} was run again by the final pass`);
      if (now.killedBy) assert.ok(!Object.hasOwn(before.testHashes, now.killedBy.file.replace(DOT_TEST, '')), `${mutantKey(entry)}: killed later by a test file that did not exist in ${earlier}`);
    }
  }
});

test('the importer pins were recomputed against git (tests\\anchor.cjs) and the browser run printed its verdict', () => {
  const [anchor] = only('anchor', 'anchor-');
  const stdout = zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(anchor.file), anchor.json.transcripts.stdout.path))).toString('utf8');
  assert.deepEqual(JSON.parse(stdout), { checked: 7, problems: [] });
  const [browser] = only('browser', 'browser-');
  const text = zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(browser.file), browser.json.transcripts.stdout.path))).toString('utf8');
  assert.match(text, /C022 BROWSER OK/);
  assert.match(text, /PASS the installed Edge is Microsoft-signed and its major is qualified/);
  assert.equal(browser.json.environmentAdded, undefined, 'CAPTURE_BROWSER_EVIDENCE stays unset');
});

test('the README states only figures that the evidence shows', () => {
  const readme = read('README.md');
  const [green] = only('green', 'green-');
  assert.ok(readme.includes(`${green.json.summary.tests} tests`), 'the GREEN test count');
  const red = latest('red', 'red-');
  assert.ok(readme.includes(`${red.json.summary.fail} of ${red.json.summary.tests}`), 'the RED failure count');
  for (const file of ['contract.js', 'identity.cjs', 'store.cjs', 'service.cjs', 'server.cjs', 'page.js']) {
    const row = rows(only('coverage', `cov-${file.replace('.', '-')}`)[0].json).find((entry) => entry.file === file);
    assert.ok(readme.includes(`${file} ${row.lines}/${row.branches}/${row.functions}`), `${file} coverage figure`);
  }
  const run = readManifest(root, `mutants/${mutationPasses().at(-1)}`);
  const killed = Object.values(run.summary).reduce((sum, figures) => sum + figures.killed, 0);
  const total = Object.values(run.summary).reduce((sum, figures) => sum + figures.total, 0);
  assert.ok(readme.includes(`${killed} of ${total} mutants`), 'the mutation figure');
  const gaps = readManifest(root, 'mutants/equivalents.json');
  for (const kind of ['equivalent', 'answered', 'open']) assert.ok(readme.includes(`${gaps.filter((entry) => entry.kind === kind).length} ${kind}`), `the README states how many gaps are ${kind}`);
  assert.ok(readme.includes(`${mutationPasses().length} mutation pass`), 'the README states how many mutation passes are archived');
  const { runs, passed, overCap, files, slowest } = loopFigures();
  assert.ok(readme.includes(`${runs} runs of ${files} files`), 'the loop run count');
  assert.ok(readme.includes(`${passed} passed`) && readme.includes(`${overCap} over the 60 s cap`), 'the loop pass and over-cap figures (a run over the cap under load is stated, never hidden)');
  assert.ok(readme.includes(`slowest ${slowest[1].maxMs} ms (${slowest[0]})`), 'the slowest loop run');
  for (const mode of ['lf', 'crlf']) {
    const fresh = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'fresh', `fresh-${mode}.json`), 'utf8'));
    assert.ok(readme.includes(`${mode.toUpperCase()} ${fresh.pass} of ${fresh.tests}`), `the fresh ${mode} figure`);
  }
  for (const [name, command] of [['RED replay', 'C022_SUBJECT_DIR'], ['per-file coverage', 'coverage.cjs'], ['browser', 'tests\\browser.cjs']]) assert.ok(readme.includes(command), `the README has the command for ${name}`);
});

// A scratch COPY of the namespace in the layout of the repository (so that the pinned input paths resolve), then one alteration, then verify.
function scratchCopy(t) {
  const base = path.join(__dirname, 'scratch', `ev-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  const target = path.join(base, 'capability', 'C022');
  const copy = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (entry.name === 'scratch') continue;
      if (entry.isDirectory()) copy(path.join(from, entry.name), path.join(to, entry.name));
      else fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
    }
  };
  copy(root, target);
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return target;
}
const flip = (file, offset = 5) => {
  const bytes = fs.readFileSync(file);
  bytes[offset % bytes.length] ^= 1;
  fs.writeFileSync(file, bytes);
};

// Every alteration of a test goes into ONE copy and is verified once (a verify reads every manifest and transcript, which costs seconds on a busy
// machine): each problem is still asserted BY NAME, so a missed alteration fails the test by its own message.
test('TAMPER: a flipped byte of a raw transcript, a truncated transcript, a deleted transcript and a forged manifest hash are each detected by name', (t) => {
  const copy = scratchCopy(t);
  const stdoutOf = (dir) => walk(path.join(copy, 'evidence', dir)).filter((file) => file.endsWith('.stdout.raw.gz'))[0];
  flip(stdoutOf('green'), 20);
  const truncated = stdoutOf('coverage');
  fs.writeFileSync(truncated, fs.readFileSync(truncated).subarray(0, 40));
  fs.rmSync(stdoutOf('browser'));
  const manifest = walk(path.join(copy, 'evidence', 'anchor')).find((candidate) => candidate.endsWith('.json') && !candidate.includes(`${path.sep}raw${path.sep}`));
  const json = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  json.transcripts.stdout.sha256 = '0'.repeat(64);
  fs.writeFileSync(manifest, JSON.stringify(json));
  const problems = verify(copy);
  assert.ok(problems.some((problem) => /green-1\.json: stdout gzip hash differs/.test(problem)), 'a flipped byte');
  assert.ok(problems.some((problem) => /cov-[a-z-]+\.json: stdout (gzip hash differs|is not valid gzip)/.test(problem)), 'a truncated transcript');
  assert.ok(problems.some((problem) => /browser-1\.json: transcript .* is missing/.test(problem)), 'a deleted transcript');
  assert.ok(problems.some((problem) => /anchor-1\.json: stdout stream hash differs/.test(problem)), 'a forged manifest hash');
});

test('TAMPER: one byte of the README, the feature, a production file, a test file or imports.json is detected, and an unsealed new test file too', (t) => {
  const copy = scratchCopy(t);
  const names = ['README.md', 'C022.feature', 'server.cjs', 'tests/server.test.cjs', 'imports.json'];
  for (const name of names) flip(path.join(copy, name), 7);
  fs.writeFileSync(path.join(copy, 'tests', 'extra.test.cjs'), '\'use strict\';\n');
  const problems = verify(copy);
  for (const name of names) assert.ok(problems.some((problem) => problem.includes(`seal: ${name} differs from its pin`)), name);
  assert.ok(problems.some((problem) => problem.includes('seal: tests/extra.test.cjs is not sealed')));
  const bare = scratchCopy(t);
  fs.rmSync(path.join(bare, 'evidence', 'seal.json'));
  assert.ok(verify(bare).includes('evidence/seal.json is missing'));
});

test('TAMPER: one byte of any evidence file that no manifest pins by itself (mutation, loop, fresh, anchor, snapshot, stub, superseded list) is detected by name, and so is an unsealed new evidence file', (t) => {
  const copy = scratchCopy(t);
  const names = ['evidence/mutants/mutation-1.json', 'evidence/mutants/equivalents.json', 'evidence/fresh/fresh-lf.json', 'evidence/fresh/fresh-crlf.json', 'evidence/anchor/anchor-1.json',
    'evidence/red/superseded.json', 'evidence/red/stub/server.cjs', 'evidence/red/snapshot-1/pipeline.test.cjs.snap'];
  for (const name of names) flip(path.join(copy, name), 7);
  fs.writeFileSync(path.join(copy, 'evidence', 'loops', 'loop-1.json'), '{');
  fs.writeFileSync(path.join(copy, 'evidence', 'mutants', 'extra.json'), '{}');
  const problems = verify(copy);
  for (const name of [...names, 'evidence/loops/loop-1.json']) assert.ok(problems.some((problem) => problem.includes(`seal: ${name} differs from its pin`)), name);
  assert.ok(problems.some((problem) => problem.includes('seal: evidence/mutants/extra.json is not sealed')));
  assert.ok(problems.some((problem) => /loop-1\.json: is not valid JSON/.test(problem)));
});

test('TAMPER: a pinned input that changed after a capture (a test file, a production file) is detected through the manifests too', (t) => {
  const copy = scratchCopy(t);
  const manifest = manifestsOf(copy).find(({ file }) => path.basename(file).startsWith('green-'));
  assert.ok(manifest && manifest.json.inputs.some((input) => input.path.endsWith('server.cjs')), 'the GREEN capture pins server.cjs');
  flip(path.join(copy, 'server.cjs'), 11);
  const pinned = manifest.json.inputs.find((input) => /tests\\server\.test\.cjs$/.test(input.path));
  flip(path.join(copy, 'tests', 'server.test.cjs'), 9);
  const problems = verify(copy);
  assert.ok(problems.some((problem) => /input .*server\.cjs differs from its pin/.test(problem)));
  assert.ok(problems.some((problem) => problem.includes(`input ${pinned.path} differs from its pin`)));
});

test('TAMPER: a flipped byte of a retained snapshot, and a retained manifest that is not listed any more, are detected by name', (t) => {
  const copy = scratchCopy(t);
  const snapshots = path.join(copy, 'evidence', 'red', 'snapshot-1');
  flip(path.join(snapshots, 'pipeline.test.cjs.snap'), 9);
  assert.ok(verify(copy).some((problem) => /red-1\.json: input .*pipeline\.test\.cjs differs from its pin/.test(problem)), 'the first RED no longer verifies against an altered snapshot');
  const unlisted = scratchCopy(t);
  fs.writeFileSync(path.join(unlisted, 'evidence', 'red', 'superseded.json'), JSON.stringify({ schemaVersion: 1, manifests: [], snapshotDir: 'evidence/red/snapshot-1' }));
  const problems = verify(unlisted);
  assert.ok(problems.some((problem) => /red-1\.json: input .*pipeline\.test\.cjs is missing/.test(problem)), 'an unlisted manifest cannot lean on the snapshots');
  assert.ok(problems.some((problem) => /red-1\.json: input .*C022\.feature differs from its pin/.test(problem)));
});

test('a green run and a replay carry the same sha for nothing that is mutable: no manifest pins a file outside this namespace except the declared imports', () => {
  for (const { json } of manifestsOf(root)) {
    for (const input of json.inputs || []) assert.ok(input.path.startsWith('capability\\C022\\') || input.path.startsWith('testing\\browser\\'), input.path);
  }
  assert.equal(typeof sha('x'), 'string');
});
