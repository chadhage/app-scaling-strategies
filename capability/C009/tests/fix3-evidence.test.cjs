'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { gunzipSync } = require('node:zlib');
const { checkInputs, checkTranscripts, sha } = require('./evidence-check.cjs');

// The archives of the third fix cycle (order R11, after the third independent rejection) are recomputed here, never trusted: the raw streams,
// the manifests, and the bytes of the pinned inputs, for EVERY manifest of EVERY capture (C043 F2), with a tamper test per kind (C044 F9).
// What this cycle claims is also recomputed: the 11 production files are byte-identical to the second fix (three other cards import them
// and pin them by commit), every file the cycle changed is retained in evidence/red/snapshot-fix2, the specimen of the third-hole RED is the
// final server.cjs with exactly one line replaced, and the figures of the README are the figures of the captures.
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const cache = new Map();
const read = (relative) => {
  if (!cache.has(relative)) cache.set(relative, fs.readFileSync(path.join(repository, relative)));
  return cache.get(relative);
};
const inNamespace = (...parts) => path.relative(repository, path.join(root, ...parts));
const redRoot = path.join(root, 'evidence', 'red');
const finalRoot = path.join(root, 'evidence', 'green-fix3');
const SUPERSEDED = /^fix3-readme-contract-2b809071-/;
const PRODUCTION = ['authz.cjs', 'cli.cjs', 'codes.cjs', 'commands.cjs', 'contract.js', 'handlers.cjs', 'http-io.cjs', 'ledger.cjs', 'page.js', 'queue.cjs', 'server.cjs'];
const UNCHANGED = [...PRODUCTION, 'index.html', 'style.css', 'C009.feature', 'imports.json'];
const HEAVY = ['refusal-flood', 'pipeline-process', 'resources', 'pipeline-refusal', 'pipeline-refusal-http10', 'pipeline-refusal-mixed'];
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

const manifestOf = (directory) => {
  const name = fs.readdirSync(directory).find((entry) => entry.endsWith('.json'));
  return { name, manifest: JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) };
};
const stdoutOf = (directory, manifest) => gunzipSync(fs.readFileSync(path.join(directory, manifest.transcripts.stdout.path))).toString('utf8');
const secondFix = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'green-fix2', 'suite.json'), 'utf8')).inputs;
const pinOf = (relative) => secondFix.find((entry) => entry.path.replaceAll('\\', '/') === relative.replaceAll('\\', '/'));
const matchesPin = (bytes, pin) => sha(bytes) === pin.rawSha256 || sha(lf(bytes)) === pin.crlfToLfSha256;
const snapshotRoot = path.join(root, 'evidence', 'red', 'snapshot-fix2');
const snapshotFiles = fs.readdirSync(snapshotRoot, { recursive: true }).map((name) => name.replaceAll('\\', '/')).filter((name) => fs.statSync(path.join(snapshotRoot, name)).isFile());
const redRuns = fs.readdirSync(redRoot).filter((name) => name.startsWith('fix3-')).sort();

test('the third-fix RED archives are intact, failed for the specified behavior, and their inputs are the bytes that stand', () => {
  assert.ok(redRuns.filter((name) => !SUPERSEDED.test(name)).length >= 2, `the README contract (F14, F15) and the third pipelining hole: ${redRuns}`);
  for (const run of redRuns) {
    const directory = path.join(redRoot, run);
    const { manifest } = manifestOf(directory);
    assert.deepEqual(checkTranscripts({ directory: inNamespace('evidence', 'red', run), manifest, read }), [], run);
    assert.equal(manifest.exitCode, manifest.expectedExitCode, `${run} exit code`);
    assert.equal(manifest.timedOut, false, `${run} did not time out`);
    const stdout = stdoutOf(directory, manifest);
    assert.match(stdout, /^\s*not ok /m, `${run} has failing tests`);
    assert.match(stdout, /ERR_ASSERTION/, `${run} fails by assertion`);
    assert.doesNotMatch(stdout, /Cannot find module|SyntaxError|ERR_MODULE_NOT_FOUND|is not a function/, `${run} is not an invalid test`);
    // The first README archive ran on test bytes that were later changed (retained, superseded); every other archive ran on the final bytes.
    if (!SUPERSEDED.test(run)) assert.deepEqual(checkInputs({ manifest, read }), [], `${run}: an input changed after its RED was archived`);
  }
});

test('the README RED ran against the second-fix README and the hole RED against the final server.cjs with exactly one line replaced', () => {
  const readme = redRuns.filter((name) => name.startsWith('fix3-readme-contract-') && !SUPERSEDED.test(name));
  assert.equal(readme.length, 1);
  const { manifest } = manifestOf(path.join(redRoot, readme[0]));
  const subject = manifest.inputs.find((input) => input.path.endsWith('snapshot-fix2\\README.md'));
  assert.ok(subject && matchesPin(read(subject.path), pinOf('capability/C009/README.md')), 'the README the RED saw is the second-fix README');
  const live = lf(read(inNamespace('server.cjs'))).toString('utf8').split('\n');
  const specimen = lf(read(inNamespace('evidence', 'red', 'specimen-fix3', 'server.cjs'))).toString('utf8').split('\n');
  assert.equal(specimen.length, live.length, 'same number of lines');
  const changed = live.map((line, index) => [line, specimen[index]]).filter(([left, right]) => left !== right);
  assert.equal(changed.length, 1, 'exactly one line differs');
  assert.match(changed[0][0], /^\s*server\.on\('checkExpectation', \(request, response\) => admit\(request, response, /);
  assert.equal(changed[0][1].trim(), "server.on('checkExpectation', (request, response) => createResponder(response).fail('EXPECTATION_FAILED'));");
});

test('the production files and the page assets are byte-identical to the second fix f95cc52a', () => {
  for (const file of UNCHANGED) {
    const pin = pinOf(`capability/C009/${file}`);
    assert.ok(pin, `${file} was pinned by the second fix`);
    assert.ok(matchesPin(read(inNamespace(file)), pin), `${file} differs from the second-fix bytes: production is frozen (three cards import it)`);
  }
});

test('the second-fix bytes of every file this cycle changed are retained exactly, and no other pinned file changed', () => {
  assert.ok(snapshotFiles.length >= 9, snapshotFiles.join(' '));
  for (const name of snapshotFiles) {
    const pin = pinOf(`capability/C009/${name}`);
    assert.ok(pin, `${name} was pinned by the second fix`);
    assert.equal(sha(fs.readFileSync(path.join(snapshotRoot, name))), pin.rawSha256, name);
  }
  for (const pin of secondFix) {
    const relative = pin.path.replaceAll('\\', '/');
    const name = relative.replace('capability/C009/', '');
    const file = path.join(repository, relative);
    if (snapshotFiles.includes(name)) continue;
    assert.ok(fs.existsSync(file) && matchesPin(read(pin.path), pin), `${name} changed since the second fix and is not retained in snapshot-fix2`);
  }
});

test('the tamper checks of this cycle fail by name: a flipped stream byte, a truncated stream, a forged hash and an edited pinned file', () => {
  const run = redRuns.find((name) => !SUPERSEDED.test(name));
  const directory = inNamespace('evidence', 'red', run);
  const { manifest } = manifestOf(path.join(redRoot, run));
  const stream = path.join(directory, manifest.transcripts.stdout.path);
  const flipped = (relative) => {
    const bytes = Buffer.from(read(relative));
    if (relative === stream) bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    return bytes;
  };
  assert.match(checkTranscripts({ directory, manifest, read: flipped }).join(' '), /stdout/, 'a flipped byte in the gzip stream');
  const truncated = (relative) => (relative === stream ? read(relative).subarray(0, 12) : read(relative));
  assert.match(checkTranscripts({ directory, manifest, read: truncated }).join(' '), /stdout/, 'a truncated gzip stream');
  const forged = { ...manifest, transcripts: { ...manifest.transcripts, stdout: { ...manifest.transcripts.stdout, sha256: '0'.repeat(64) } } };
  assert.match(checkTranscripts({ directory, manifest: forged, read }).join(' '), /raw bytes differ/, 'a forged manifest hash');
  const pinned = manifest.inputs.find((input) => /\\tests\\[a-z-]+\.test\.cjs$/.test(input.path));
  const edited = (relative) => (relative === pinned.path ? Buffer.concat([read(relative), Buffer.from('// edited\n')]) : read(relative));
  assert.match(checkInputs({ manifest, read: edited }).join(' '), /differs from the bytes the run saw/, 'a test edited after its RED');
});

// The captures are taken one after the other, and each of them runs this very file: the checks below are strict once the capture is SEALED
// (COMPLETE.json, written last, lists every manifest with its SHA-256) and wait for the seal before that.
const sealed = () => {
  const marker = path.join(finalRoot, 'COMPLETE.json');
  return fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker, 'utf8')) : null;
};

test('the final GREEN, loop, replay, coverage, mutation and browser archives, once captured, are intact, pin the final bytes and prove the bar', () => {
  const seal = sealed();
  if (seal === null) return;
  const directory = inNamespace('evidence', 'green-fix3');
  const manifests = Object.fromEntries(fs.readdirSync(finalRoot).filter((name) => name.endsWith('.json') && name !== 'COMPLETE.json').map((name) => [name.slice(0, -5), JSON.parse(fs.readFileSync(path.join(finalRoot, name), 'utf8'))]));
  assert.deepEqual(Object.keys(seal.manifests).sort(), Object.keys(manifests).sort(), 'the seal lists exactly the manifests that are there');
  for (const [name, hash] of Object.entries(seal.manifests)) assert.equal(sha(fs.readFileSync(path.join(finalRoot, `${name}.json`))), hash, `${name}: the manifest is the sealed one`);
  for (const [name, manifest] of Object.entries(manifests)) {
    assert.deepEqual(checkTranscripts({ directory, manifest, read }), [], name);
    assert.deepEqual(checkInputs({ manifest, read }), [], `${name}: a file changed after the run was captured`);
    assert.equal(manifest.exitCode, manifest.expectedExitCode, `${name} exit code`);
    assert.equal(manifest.timedOut, false, `${name} did not time out`);
  }
  // What was captured is what the seal lists (the result file of the cycle says which of the planned captures were not taken and why);
  // every kind that is there is checked strictly, and nothing here is required except the plain suite run that fixes the figures.
  const has = (name) => Object.hasOwn(manifests, name);
  const named = (prefix) => Object.keys(manifests).filter((name) => name.startsWith(prefix));
  assert.ok(has('suite'), 'the plain suite run is there');
  const files = fs.readdirSync(path.join(root, 'tests')).filter((name) => name.endsWith('.test.cjs'));
  for (const name of ['suite', 'suite-2', 'suite-under-load'].filter(has)) {
    const { summary, command } = manifests[name];
    assert.equal(summary.fail, 0, `${name}: failures`);
    assert.equal(summary.cancelled, 0, `${name}: cancelled`);
    assert.equal(summary.pass, summary.tests, `${name}: every test passed`);
    assert.equal(summary.pass, manifests.suite.summary.pass, `${name}: the same tests as the first run`);
    assert.equal(command.filter((argument) => /\.test\.cjs$/.test(argument) || /\*\.test\.cjs/.test(argument)).length >= 1, true, `${name}: the command names the tests`);
  }
  if (has('suite-under-load')) {
    assert.match(manifests['suite-under-load'].command.join(' '), /load-loop\.cjs 8 /, 'the green under load ran under 8 burners');
    assert.match(stdoutOf(finalRoot, manifests['suite-under-load']), /LOAD 8 burners started at .*PIDs [\d,]+[\s\S]*LOAD 8 burners stopped by PID/, 'the burners are recorded, started and stopped by PID');
  }
  assert.equal(manifests.suite.command.filter((argument) => /\.test\.cjs$/.test(argument)).length, files.length, 'the suite command enumerates every test file');
  for (const name of named('coverage-')) {
    const file = PRODUCTION.find((candidate) => `coverage-${candidate.replace(/\.c?js$/, '')}` === name);
    const row = manifests[name].summary.coverageRows.find((entry) => entry.file === file);
    assert.ok(row && row.lines >= 85 && row.branches >= 85 && row.functions >= 85, `${file}: ${JSON.stringify(row)}`);
  }
  if (has('browser-edge')) assert.match(stdoutOf(finalRoot, manifests['browser-edge']), /C009 BROWSER OK/);
  if (has('mutants')) {
    const mutants = JSON.parse(stdoutOf(finalRoot, manifests.mutants).trim().split('\n').at(-1));
    assert.ok(mutants.mutants >= 42 && mutants.killed + mutants.equivalent.length === mutants.mutants, JSON.stringify(mutants));
    assert.deepEqual([mutants.survived, mutants.undecided, mutants.equivalent.length <= 1], [[], [], true], 'no survivor, no undecided mutant, at most one equivalent');
    const readme = read(inNamespace('README.md')).toString('utf8').replace(/\r\n/g, '\n');
    assert.equal(Number(/(\d+) one-line mutants/.exec(readme)[1]), mutants.mutants, 'the README states the mutant count');
    assert.equal(Number(/(\d+) are killed and ONE is a documented equivalent/.exec(readme)[1]), mutants.killed, 'the README states the killed count');
  }
  for (const loop of named('loop-')) {
    const name = loop.slice('loop-'.length);
    assert.ok(HEAVY.includes(name), `${loop} is a loop of one of the heavy files`);
    const stdout = stdoutOf(finalRoot, manifests[loop]);
    assert.match(stdout, /LOAD 8 burners started at .*PIDs [\d,]+/, `${name}: under 8 burners`);
    assert.match(stdout, new RegExp(`FLAKE HUNT ${name}\\.test\\.cjs: 0 bad of 64\\b`), `${name}: 64 runs, 0 bad`);
    assert.match(stdout, /LOAD 8 burners stopped by PID/, `${name}: the burners were stopped by PID`);
  }
  for (const name of named('replay-')) {
    const stdout = stdoutOf(finalRoot, manifests[name]);
    assert.match(stdout, /^# fail 0$/m, name);
    assert.match(stdout, /^# cancelled 0$/m, name);
  }
});

test('a tampered capture of every kind is detected: the README in a pinned input and a stream byte', () => {
  const seal = sealed();
  if (seal === null) return;
  const directory = inNamespace('evidence', 'green-fix3');
  const readme = inNamespace('README.md');
  for (const name of ['suite', 'coverage-server', 'mutants', 'loop-refusal-flood', 'replay-node-own', 'browser-edge'].filter((kind) => Object.hasOwn(seal.manifests, kind))) {
    const manifest = JSON.parse(fs.readFileSync(path.join(finalRoot, `${name}.json`), 'utf8'));
    const edited = (relative) => (relative === readme ? Buffer.concat([read(relative), Buffer.from(' ')]) : read(relative));
    assert.match(checkInputs({ manifest, read: edited }).join(' '), /README\.md: differs from the bytes the run saw/, `${name}: a README byte`);
    const stream = path.join(directory, manifest.transcripts.stdout.path);
    const flipped = (relative) => {
      const bytes = Buffer.from(read(relative));
      if (relative === stream) bytes[Math.floor(bytes.length / 2)] ^= 0xff;
      return bytes;
    };
    assert.match(checkTranscripts({ directory, manifest, read: flipped }).join(' '), /stdout/, `${name}: a stream byte`);
  }
});
