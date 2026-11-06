'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { gunzipSync } = require('node:zlib');
const { checkInputs, checkTranscripts } = require('./evidence-check.cjs');

// The archives of the second fix cycle (order R9, after the second independent rejection) are recomputed here, never trusted: the raw
// streams, the manifests, and the bytes of the pinned inputs, for EVERY manifest of EVERY capture (C043 F2). The tamper test edits bytes
// in memory and demands that the check notices (C044 F9). Two earlier generations of the REDs (the first on the test bytes before the
// controller added the Node-own answers and the HTTP/1.0 framings, the second before the wall-clock waits of the new tests were
// removed) stay retained and are marked superseded.
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const read = (relative) => fs.readFileSync(path.join(repository, relative));
const inNamespace = (...parts) => path.relative(repository, path.join(root, ...parts));
const redRoot = path.join(root, 'evidence', 'red');
const finalRoot = path.join(root, 'evidence', 'green-fix2');
const SUPERSEDED = /^fix2-.*-(6d73afb4|870a592a|388bb2b3|3ddb221d|a1c0f6d2|b52e7a19|c63f8b2a|d74a9c3b|e85b0d4c|f5a1d9c3|0a7b3e68)-/;
// The F2b hunt is a flake loop of the UNCHANGED first-fix resources test against first-fix production bytes (a hand-built record like the
// R8 heap hunt): its inputs are all first-fix files, so every one is compared with the first-fix pin, and its failures are BAD lines.
const HUNT = /^fix2-resources-hunt-/;
const PRODUCTION = ['authz.cjs', 'cli.cjs', 'codes.cjs', 'commands.cjs', 'contract.js', 'handlers.cjs', 'http-io.cjs', 'ledger.cjs', 'page.js', 'queue.cjs', 'server.cjs'];

const manifestOf = (directory) => {
  const name = fs.readdirSync(directory).find((entry) => entry.endsWith('.json'));
  return { name, manifest: JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) };
};
const redRuns = fs.readdirSync(redRoot).filter((name) => name.startsWith('fix2-')).sort();
const stdoutOf = (directory, manifest) => gunzipSync(fs.readFileSync(path.join(directory, manifest.transcripts.stdout.path))).toString('utf8');
const firstFix = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'green-fix', 'suite.json'), 'utf8')).inputs;
const pinOf = (inputPath) => firstFix.find((entry) => path.basename(entry.path.replaceAll('\\', '/')) === path.basename(inputPath.replaceAll('\\', '/')));

test('the second-fix RED archives are intact, failed for the specified behavior, and ran against the first-fix production bytes', () => {
  const current = redRuns.filter((name) => !SUPERSEDED.test(name));
  assert.ok(current.length >= 5, `pipeline in process and across processes, read stop and audit ring, flood, Node-own answers: ${current}`);
  for (const run of redRuns) {
    const directory = path.join(redRoot, run);
    const { manifest } = manifestOf(directory);
    assert.deepEqual(checkTranscripts({ directory: inNamespace('evidence', 'red', run), manifest, read }), [], run);
    assert.equal(manifest.exitCode, manifest.expectedExitCode, `${run} exit code`);
    const stdout = stdoutOf(directory, manifest);
    assert.match(stdout, HUNT.test(run) ? /^BAD resources\.test\.cjs run /m : /^\s*not ok /m, `${run} has failing tests`);
    assert.match(stdout, /ERR_ASSERTION|must stay below|bytes of a refused connection|did not match the regular expression/, `${run} fails by assertion`);
    assert.doesNotMatch(stdout, /Cannot find module|SyntaxError|ERR_MODULE_NOT_FOUND|is not a function/, `${run} is not an invalid test`);
    if (SUPERSEDED.test(run)) continue;
    if (HUNT.test(run)) {
      for (const input of manifest.inputs) {
        const pin = pinOf(input.path);
        assert.ok(pin, `${run}: ${input.path} was pinned by the first fix`);
        assert.ok([input.rawSha256, input.crlfToLfSha256].some((hash) => hash === pin.rawSha256 || hash === pin.crlfToLfSha256), `${run}: ${input.path} is not the first-fix file`);
      }
      continue;
    }
    const production = manifest.inputs.filter((input) => PRODUCTION.some((file) => input.path.endsWith(`\\${file}`)) && !/\\tests\\/.test(input.path));
    assert.ok(production.length >= 8, `${run}: the production files it ran against are pinned`);
    for (const input of production) {
      const pin = pinOf(input.path);
      assert.ok(pin, `${run}: ${input.path} was pinned by the first fix`);
      const seen = [input.rawSha256, input.crlfToLfSha256, input.sha256];
      assert.ok(seen.includes(pin.rawSha256) || seen.includes(pin.crlfToLfSha256), `${run}: ${input.path} is not the first-fix production file`);
    }
    const stable = (input) => /\\tests\\/.test(input.path) || input.path.endsWith('.gitattributes');
    assert.deepEqual(checkInputs({ manifest, read, pinned: stable }), [], `${run}: a test changed after its RED was archived`);
  }
});

test('tampering with a retained stream, a gzip stream or a pinned test of a second-fix RED is detected', () => {
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
  const test = manifest.inputs.find((input) => /\\tests\\[a-z-]+\.test\.cjs$/.test(input.path));
  const edited = (relative) => (relative === test.path ? Buffer.concat([read(relative), Buffer.from('// edited\n')]) : read(relative));
  assert.match(checkInputs({ manifest, read: edited, pinned: (input) => input.path === test.path }).join(' '), /differs from the bytes the run saw/, 'a test edited after its RED');
});

test('the final GREEN, coverage, replay, flake-loop, mutation and browser archives, once captured, are intact, pin the final bytes and prove the bar', () => {
  if (!fs.existsSync(finalRoot)) return;
  const manifests = Object.fromEntries(fs.readdirSync(finalRoot).filter((name) => name.endsWith('.json')).map((name) => [name.slice(0, -5), JSON.parse(fs.readFileSync(path.join(finalRoot, name), 'utf8'))]));
  for (const [name, manifest] of Object.entries(manifests)) {
    const directory = inNamespace('evidence', 'green-fix2');
    assert.deepEqual(checkTranscripts({ directory, manifest, read }), [], name);
    assert.deepEqual(checkInputs({ manifest, read }), [], `${name}: a file changed after the run was captured`);
    assert.equal(manifest.exitCode, manifest.expectedExitCode, `${name} exit code`);
  }
  assert.equal(manifests.suite.summary.fail, 0);
  assert.ok(manifests.suite.summary.pass >= 800, `${manifests.suite.summary.pass} tests passed`);
  for (const file of PRODUCTION) {
    const row = manifests[`coverage-${file.replace(/\.c?js$/, '')}`].summary.coverageRows.find((entry) => entry.file === file);
    assert.ok(row && row.lines >= 85 && row.branches >= 85 && row.functions >= 85, `${file}: ${JSON.stringify(row)}`);
  }
  assert.match(stdoutOf(finalRoot, manifests['browser-edge']), /C009 BROWSER OK/);
  const mutants = JSON.parse(stdoutOf(finalRoot, manifests.mutants).trim().split('\n').at(-1));
  assert.ok(mutants.mutants >= 35 && mutants.killed + mutants.equivalent.length === mutants.mutants && mutants.survived.length === 0 && mutants.equivalent.length <= 1, JSON.stringify(mutants));
  const loops = Object.keys(manifests).filter((name) => name.startsWith('loop-'));
  assert.ok(loops.length >= 5, `the flake loops of the flood and resource files: ${loops}`);
  for (const name of loops) assert.match(stdoutOf(finalRoot, manifests[name]), /FLAKE HUNT \S+: 0 bad of (6[4-9]|[7-9]\d|\d{3,})\b/, name);
  const replays = Object.keys(manifests).filter((name) => name.startsWith('replay-'));
  assert.ok(replays.length >= 5, `every new RED replayed on the final code: ${replays}`);
});
