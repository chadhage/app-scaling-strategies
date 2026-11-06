'use strict';

// The archived evidence is recomputed, not trusted: every transcript, every declared input and every exit code, and a tampered copy fails.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { manifests, check, stdoutOf, sha, root } = require('.\\evidence-check.cjs');

const redManifests = () => manifests().filter((file) => file.includes(`${path.sep}red${path.sep}run-`));
const overlay = (changes) => (target) => (Object.hasOwn(changes, target) ? changes[target] : fs.readFileSync(target));

test('every archived run recomputes: transcripts, declared inputs and exit code', () => {
  const list = manifests();
  assert.ok(list.length >= 1);
  for (const file of list) assert.deepEqual(check(file).problems, [], file);
});

test('the RED archive is behavioral: exit 1 from failed assertions about the specified behavior, not a missing module or a syntax error', () => {
  const reds = redManifests();
  assert.ok(reds.length >= 1);
  for (const file of reds) {
    const { manifest } = check(file);
    const text = stdoutOf(file);
    assert.deepEqual([manifest.expectedExitCode, manifest.exitCode, manifest.timedOut], [1, 1, false]);
    assert.ok(manifest.summary.fail >= 10, 'most behavioral tests fail against the naive first attempt');
    assert.match(text, /ERR_ASSERTION/);
    assert.doesNotMatch(text, /Cannot find module|ERR_MODULE_NOT_FOUND|SyntaxError|ReferenceError|is not a function/);
    for (const behavior of ['reducer folded over entries', 'NOT_RECORDED', 'DUPLICATE', 'exact skipped range', 'INCOMPLETE', 'UNKNOWN', 'decoder code', 'jumps land exactly', 're-executes nothing', 'forged state', 'fragment']) {
      assert.ok(manifest.summary.notOk.some((name) => name.includes(behavior)), `the RED covers: ${behavior}`);
    }
    assert.ok(manifest.inputs.some((input) => input.path.endsWith('timeline.red.test.cjs')));
    assert.ok(manifest.inputs.some((input) => input.path.endsWith('timeline.stub.cjs')));
  }
});

test('tampering with a raw transcript, a declared input, the exit code or a transcript file is detected', () => {
  const [file] = redManifests();
  const dir = path.dirname(file);
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const stdout = path.join(dir, manifest.transcripts.stdout.path);
  const flipped = Buffer.from(fs.readFileSync(stdout));
  flipped[flipped.length - 12] ^= 1;
  assert.match(check(file, overlay({ [stdout]: flipped })).problems.join('\n'), /stdout/);
  const forged = zlib.gzipSync(Buffer.from('# fail 0\n'));
  assert.match(check(file, overlay({ [stdout]: forged })).problems.join('\n'), /gzip bytes differ[\s\S]*raw bytes differ|raw bytes differ/);
  const input = path.join(root, '..', '..', manifest.inputs.find((item) => item.path.endsWith('timeline.red.test.cjs')).path);
  assert.match(check(file, overlay({ [input]: Buffer.from('// weakened') })).problems.join('\n'), /timeline\.red\.test\.cjs: differs from the input hash/);
  const exit = Buffer.from(JSON.stringify({ ...manifest, exitCode: 0 }));
  assert.match(check(file, overlay({ [file]: exit })).problems.join('\n'), /exit code/);
  assert.match(check(file, overlay({ [file]: Buffer.from(JSON.stringify({ ...manifest, timedOut: true })) })).problems.join('\n'), /timed out/);
  assert.throws(() => check(file, (target) => { if (target === stdout) throw new Error('missing'); return fs.readFileSync(target); }), /missing/);
  assert.match(check(file, overlay({ [stdout]: Buffer.from('not gzip') })).problems.join('\n'), /not a gzip stream/);
});

test('a browser observation summary pins the exact sources it observed and its DOM snapshot', () => {
  const browser = path.join(root, 'evidence', 'browser');
  const summaries = fs.existsSync(browser) ? fs.readdirSync(browser).map((name) => path.join(browser, name, 'summary.json')).filter((file) => fs.existsSync(file)) : [];
  for (const file of summaries) {
    const summary = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(summary.outcome, 'passed');
    assert.deepEqual([summary.liveAzureResult, summary.packagesDownloaded, summary.cloudRuns, summary.spend], [false, 0, 0, 0]);
    for (const [name, digest] of Object.entries(summary.sourceSha256)) assert.equal(sha(fs.readFileSync(path.join(root, name))), digest, `${name} differs from the source the browser observed`);
    const snapshot = fs.readFileSync(path.join(path.dirname(file), 'dom-restart-gap-position-17.html'));
    assert.equal(sha(snapshot), summary.snapshotSha256);
    assert.ok(summary.checks.length >= 10 && summary.checks.every((entry) => entry.passed));
    assert.equal(summary.edge.signature, 'Valid');
    assert.ok(summary.edge.qualifiedMajors.includes(summary.edge.major));
    assert.ok(summary.cspViolations.filter((item) => item.startsWith('connect-src')).length >= 4);
    assert.ok(summary.cspViolations.some((item) => item.startsWith('script-src-elem')) && summary.cspViolations.some((item) => item.startsWith('style-src-attr')));
    const tampered = Buffer.from(snapshot);
    tampered[tampered.length - 3] ^= 1;
    assert.notEqual(sha(tampered), summary.snapshotSha256, 'a changed DOM snapshot would be detected');
  }
});

test('evidence folders keep their gitattributes and every archived file name is unique', () => {
  assert.equal(fs.readFileSync(path.join(root, 'evidence', '.gitattributes'), 'utf8').trim(), '* -text -diff');
  const names = manifests().map((file) => path.basename(file));
  assert.equal(new Set(names).size, names.length, 'a recorded run is never overwritten or reused');
  for (const file of manifests()) assert.ok(fs.existsSync(path.join(path.dirname(file), 'raw')), file);
});
