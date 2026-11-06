'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { gunzipSync } = require('node:zlib');
const { checkInputs, checkTranscripts, sha } = require('./evidence-check.cjs');

// The archives of the fix cycle after the independent review (order R8) are recomputed here, never trusted: the raw streams, the
// manifests and the bytes of the inputs. The tamper tests edit bytes in memory and demand that the check notices (C044 F9, L-0133).
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const read = (relative) => fs.readFileSync(path.join(repository, relative));
const inNamespace = (...parts) => path.relative(repository, path.join(root, ...parts));
const redRoot = path.join(root, 'evidence', 'red');
const finalRoot = path.join(root, 'evidence', 'green-fix');
const SUPERSEDED = /^fix-(refusal-flood-(720df817|24ff8e0e)|timeouts-9e787b44)/;
const PRODUCTION = ['authz.cjs', 'cli.cjs', 'codes.cjs', 'commands.cjs', 'contract.js', 'handlers.cjs', 'http-io.cjs', 'ledger.cjs', 'page.js', 'queue.cjs', 'server.cjs'];

const manifestOf = (directory) => {
  const name = fs.readdirSync(directory).find((entry) => entry.endsWith('.json'));
  return { name, manifest: JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) };
};
const redRuns = fs.readdirSync(redRoot).filter((name) => name.startsWith('fix-')).sort();
const stdoutOf = (directory, manifest) => gunzipSync(fs.readFileSync(path.join(directory, manifest.transcripts.stdout.path))).toString('utf8');
const firstPublication = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'green', 'green-suite.json'), 'utf8')).inputs;
const pinOf = (inputPath) => firstPublication.find((entry) => path.basename(entry.path.replaceAll('\\', '/')) === path.basename(inputPath.replaceAll('\\', '/')));
// The fix of order R9 changed some files after the R8 archives pinned them. Their R8 bytes are retained in evidence/red/snapshot-fix1 and
// every R8 pin is recomputed against those bytes; every other pinned file must still equal the live file (a silent change is detected).
const snapshotRoot = path.join(root, 'evidence', 'red', 'snapshot-fix1');
const snapshotFiles = fs.readdirSync(snapshotRoot, { recursive: true }).map((name) => name.replaceAll('\\', '/')).filter((name) => fs.statSync(path.join(snapshotRoot, name)).isFile());
const readFix1 = (relative) => {
  const name = path.relative(root, path.join(repository, relative)).replaceAll('\\', '/');
  return snapshotFiles.includes(name) ? fs.readFileSync(path.join(snapshotRoot, name)) : read(relative);
};

test('the NEW RED archives are intact and failed for the specified behavior, not for a missing module', () => {
  assert.ok(redRuns.length >= 5, `refusal close, refusal flood (two attempts), quota and ring, timeouts, resource heap: ${redRuns}`);
  for (const run of redRuns) {
    const directory = path.join(redRoot, run);
    const { manifest } = manifestOf(directory);
    assert.deepEqual(checkTranscripts({ directory: inNamespace('evidence', 'red', run), manifest, read }), [], run);
    const stdout = stdoutOf(directory, manifest);
    if (manifest.exitCode !== undefined) assert.equal(manifest.exitCode, manifest.expectedExitCode, `${run} exit code`);
    assert.match(stdout, /^(not ok|BAD) /m, `${run} has failing tests`);
    assert.match(stdout, /ERR_ASSERTION|blocked for|must stay below/, `${run} fails by assertion`);
    assert.doesNotMatch(stdout, /Cannot find module|SyntaxError|ERR_MODULE_NOT_FOUND|TypeError/, `${run} is not an invalid test`);
  }
});

test('every NEW RED archive pins the first-publication production bytes and the test bytes that still stand', () => {
  for (const run of redRuns.filter((name) => !SUPERSEDED.test(name))) {
    const { manifest } = manifestOf(path.join(redRoot, run));
    const handBuilt = manifest.exitCode === undefined;
    const subject = manifest.inputs.filter((input) => handBuilt || (PRODUCTION.some((file) => input.path.endsWith(`\\${file}`)) && !/\\tests\\/.test(input.path)));
    for (const input of subject) {
      const pin = pinOf(input.path);
      assert.ok(pin, `${run}: ${input.path} is a first-publication file`);
      const seen = [input.rawSha256, input.crlfToLfSha256, input.sha256];
      assert.ok(seen.includes(pin.rawSha256) || seen.includes(pin.crlfToLfSha256), `${run}: ${input.path} is not the first-publication production file`);
    }
    if (!handBuilt) {
      const stable = (input) => /\\tests\\/.test(input.path) || input.path.endsWith('.gitattributes');
      assert.deepEqual(checkInputs({ manifest, read: readFix1, pinned: stable }), [], `${run}: a test changed after its RED was archived`);
    }
  }
});

test('the first-publication GREEN and coverage archives are still intact', () => {
  const directory = path.join(root, 'evidence', 'green');
  const names = fs.readdirSync(directory).filter((name) => name.endsWith('.json'));
  assert.ok(names.length >= 13, names.join(' '));
  for (const name of names) {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    assert.deepEqual(checkTranscripts({ directory: inNamespace('evidence', 'green'), manifest, read }), [], name);
  }
});

test('tampering with a retained stream, a gzip stream or a pinned input is detected', () => {
  const run = redRuns.find((name) => name.startsWith('fix-refusal-close-'));
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
  const stable = (input) => /\\tests\\/.test(input.path);
  const edited = (relative) => (relative.endsWith('refusal-close.test.cjs') ? Buffer.concat([read(relative), Buffer.from('// edited\n')]) : read(relative));
  assert.match(checkInputs({ manifest, read: edited, pinned: stable }).join(' '), /refusal-close\.test\.cjs/, 'a test edited after its RED');
  const forged = { ...manifest, transcripts: { ...manifest.transcripts, stdout: { ...manifest.transcripts.stdout, sha256: '0'.repeat(64) } } };
  assert.match(checkTranscripts({ directory, manifest: forged, read }).join(' '), /raw bytes differ/, 'a forged manifest hash');
});

test('the final GREEN, coverage, replay and browser archives, once captured, are intact, pin the final bytes and prove 85/85/85', () => {
  if (!fs.existsSync(finalRoot)) return;
  const manifests = Object.fromEntries(fs.readdirSync(finalRoot).filter((name) => name.endsWith('.json')).map((name) => [name.slice(0, -5), JSON.parse(fs.readFileSync(path.join(finalRoot, name), 'utf8'))]));
  for (const [name, manifest] of Object.entries(manifests)) {
    const directory = inNamespace('evidence', 'green-fix');
    assert.deepEqual(checkTranscripts({ directory, manifest, read }), [], name);
    assert.deepEqual(checkInputs({ manifest, read: readFix1 }), [], `${name}: a file changed after the run was captured`);
    assert.equal(manifest.exitCode, manifest.expectedExitCode, `${name} exit code`);
  }
  assert.equal(manifests.suite.summary.fail, 0);
  assert.ok(manifests.suite.summary.pass >= 150, `${manifests.suite.summary.pass} tests passed`);
  for (const file of PRODUCTION) {
    const row = manifests[`coverage-${file.replace(/\.c?js$/, '')}`].summary.coverageRows.find((entry) => entry.file === file);
    assert.ok(row && row.lines >= 85 && row.branches >= 85 && row.functions >= 85, `${file}: ${JSON.stringify(row)}`);
  }
  assert.match(stdoutOf(finalRoot, manifests['browser-edge']), /C009 BROWSER OK/);
});

test('the R8 bytes of every file the R9 fix changed are retained exactly: each snapshot equals the pin of the first fix', () => {
  const suite = JSON.parse(fs.readFileSync(path.join(finalRoot, 'suite.json'), 'utf8'));
  assert.ok(snapshotFiles.length >= 12, snapshotFiles.join(' '));
  for (const name of snapshotFiles) {
    const pin = suite.inputs.find((input) => input.path.replaceAll('\\', '/') === `capability/C009/${name}`);
    assert.ok(pin, `${name} was pinned by the first fix`);
    assert.equal(sha(fs.readFileSync(path.join(snapshotRoot, name))), pin.rawSha256, name);
  }
});
