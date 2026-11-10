'use strict';

// The archived evidence is recomputed, not trusted: every transcript, every declared input and every exit code, and a tampered copy fails.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { manifests, check, stdoutOf, sha, root, historical, firstBlob, firstBlobs, acceptedBlob, FIRST_PUBLICATION, repository, acceptedFixSource } = require('.\\evidence-check.cjs');
const { lf, crlf } = require('.\\pins-check.cjs');

const redManifests = () => manifests().filter((file) => historical(file) && file.includes(`${path.sep}red${path.sep}run-`));
const overlay = (changes) => (target) => (Object.hasOwn(changes, target) ? changes[target] : fs.readFileSync(target));

test('every archived run recomputes: transcripts, declared inputs and exit code', () => {
  const list = manifests();
  assert.ok(list.length >= 1);
  for (const file of list) assert.deepEqual(check(file).problems, [], file);
  assert.ok(list.some(historical), 'the first-publication captures are still archived');
});

test('U049 the amendment checker is byte-pinned and the complete accepted/current namespace remains closed', () => {
  const helper = fs.readFileSync(path.join(__dirname, 'u049-authority.cjs'));
  assert.equal(sha(helper), 'dc372b4290a632fbb24f8716c421cecded2a884efd0967c57248b88888e7f6f2', 'acyclic checker pin; a later edit requires another numbered amendment');
  const authority = require('.\\u049-authority.cjs');
  const chain = authority.load(root);
  const counts = authority.checkCurrent(chain, (relative) => fs.readFileSync(path.join(root, relative)), authority.filesIn(root));
  assert.equal(counts.sealed, 120);
  assert.equal(counts.replacements, 3);
  assert.ok(counts.additions > 10);
});

test('the first-publication archive is immutable: every file under evidence\\ of commit 368332e2a881 is still byte-identical (the fix only adds evidence\\fix)', () => {
  const { execFileSync } = require('node:child_process');
  const names = execFileSync('git', ['--no-pager', 'ls-tree', '-r', '--name-only', FIRST_PUBLICATION, '--', 'capability/X001/evidence'], { cwd: repository, windowsHide: true })
    .toString('utf8').split(/\r?\n/).filter(Boolean).map((name) => name.replaceAll('/', '\\'));
  assert.equal(names.length, 23, 'the first publication archived 23 evidence files');
  const blobs = firstBlobs(names);
  for (const name of names) {
    const now = fs.existsSync(path.join(repository, name)) ? fs.readFileSync(path.join(repository, name)) : null;
    assert.ok(now !== null && sha(now) === sha(blobs.get(name)), `${name} is unchanged since the first publication`);
  }
});

test('a foreign input is compared by its LF-normalized hash: the LF and the CRLF form both pass, one changed byte fails, and an own input stays byte-exact', () => {
  const text = Buffer.from('module.exports = 1;\nconst two = 2;\n');
  const own = Buffer.from('a\nb\n');
  const readme = Buffer.from('# README\r\nthe figures block\r\n');
  const file = path.join(root, 'evidence', 'fix', 'fixture', 'fixture.json');
  const gz = (bytes) => zlib.gzipSync(bytes);
  const stream = (name, bytes) => ({ path: `raw\\fixture.${name}.raw.gz`, bytes: bytes.length, sha256: sha(bytes), gzipBytes: gz(bytes).length, gzipSha256: sha(gz(bytes)) });
  const stdout = Buffer.from('# pass 1\n');
  const stderr = Buffer.alloc(0);
  const manifest = {
    schemaVersion: 1, exitCode: 0, expectedExitCode: 0, timedOut: false, transcripts: { stdout: stream('stdout', stdout), stderr: stream('stderr', stderr) },
    inputs: [{ path: 'capability\\C044\\reducer.js', rawSha256: sha(crlf(text)), crlfToLfSha256: sha(text) },
      { path: 'capability\\X001\\own.txt', rawSha256: sha(own), crlfToLfSha256: sha(lf(own)) },
      { path: 'capability\\X001\\README.md', rawSha256: sha(readme), crlfToLfSha256: sha(lf(readme)) }],
  };
  const reader = (foreign, ownBytes = own, readmeBytes = readme) => (target) => {
    const files = new Map([[file, Buffer.from(JSON.stringify(manifest))], [path.join(path.dirname(file), 'raw', 'fixture.stdout.raw.gz'), gz(stdout)],
      [path.join(path.dirname(file), 'raw', 'fixture.stderr.raw.gz'), gz(stderr)], [path.join(repository, 'capability', 'C044', 'reducer.js'), foreign],
      [path.join(repository, 'capability', 'X001', 'own.txt'), ownBytes], [path.join(repository, 'capability', 'X001', 'README.md'), readmeBytes]]);
    if (!files.has(target)) throw new Error(`unexpected read ${target}`);
    return files.get(target);
  };
  assert.deepEqual(check(file, reader(text)).problems, [], 'the LF form of a foreign file (fresh checkout, git archive)');
  assert.deepEqual(check(file, reader(crlf(text))).problems, [], 'the CRLF form of a foreign file (owner tree, core.autocrlf)');
  for (const changed of [Buffer.from(text.toString().replace('two', 'tw0')), crlf(Buffer.from(text.toString().replace('two', 'tw0')))]) {
    assert.match(check(file, reader(changed)).problems.join('\n'), /capability\\C044\\reducer\.js: differs from the input hash recorded/);
  }
  assert.match(check(file, reader(text, crlf(own))).problems.join('\n'), /capability\\X001\\own\.txt: differs from the input hash recorded/, 'an own file is byte-exact (the namespace is -text)');
  assert.match(check(file, reader(text, own, Buffer.from('# README\r\nthe figures bloCk\r\n'))).problems.join('\n'), /capability\\X001\\README\.md: differs from the input hash recorded/, 'one README byte (F8): a capture that lists the README pins it');
  assert.equal(check(file, reader(Buffer.concat([text.subarray(0, 8), Buffer.from('\r'), text.subarray(8)]))).problems.length, 1, 'a half-converted foreign file is neither form');
});

test('a foreign input that a scratch tree does not hold is verified against the accepted blob of its namespace: the right bytes pass, other bytes and an unpinned namespace are reported by name, an absent own file stays an error', () => {
  const relative = 'capability\\C034\\imports.json';
  const accepted = acceptedBlob(relative);
  assert.ok(accepted, 'the accepted blob of the C034 file exists in git');
  const file = path.join(root, 'evidence', 'fix', 'fixture', 'fixture.json');
  const gz = (bytes) => zlib.gzipSync(bytes);
  const stdout = Buffer.from('# pass 1\n');
  const stderr = Buffer.alloc(0);
  const stream = (name, bytes) => ({ path: `raw\\fixture.${name}.raw.gz`, bytes: bytes.length, sha256: sha(bytes), gzipBytes: gz(bytes).length, gzipSha256: sha(gz(bytes)) });
  const manifestFor = (inputs) => ({ schemaVersion: 1, exitCode: 0, expectedExitCode: 0, timedOut: false, transcripts: { stdout: stream('stdout', stdout), stderr: stream('stderr', stderr) }, inputs });
  const reader = (manifest) => (target) => {
    const files = new Map([[file, Buffer.from(JSON.stringify(manifest))], [path.join(path.dirname(file), 'raw', 'fixture.stdout.raw.gz'), gz(stdout)], [path.join(path.dirname(file), 'raw', 'fixture.stderr.raw.gz'), gz(stderr)]]);
    if (files.has(target)) return files.get(target);
    throw Object.assign(new Error(`ENOENT: ${target}`), { code: 'ENOENT' });
  };
  const input = (name, bytes) => ({ path: name, rawSha256: sha(bytes), crlfToLfSha256: sha(lf(bytes)) });
  assert.deepEqual(check(file, reader(manifestFor([input(relative, accepted)]))).problems, []);
  assert.deepEqual(check(file, reader(manifestFor([input(relative, crlf(accepted))]))).problems, [], 'the CRLF form of the same blob has the same LF hash');
  assert.match(check(file, reader(manifestFor([input(relative, Buffer.from('other'))]))).problems.join('\n'), /capability\\C034\\imports\.json: absent from this tree and not equal to the accepted blob/);
  assert.match(check(file, reader(manifestFor([input('capability\\C999\\nothing.js', accepted)]))).problems.join('\n'), /capability\\C999\\nothing\.js: absent from this tree/);
  assert.throws(() => check(file, reader(manifestFor([input('capability\\X001\\absent.txt', Buffer.from('x'))]))), /ENOENT/, 'an own file that is absent is an error, never accepted');
});

test('a current capture pins the working tree: a changed own input is reported by name', () => {
  const current = manifests().filter((file) => !historical(file));
  assert.ok(current.length >= 1, 'the fix archived its own captures');
  const [file] = current;
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const own = manifest.inputs.find((input) => input.path.startsWith('capability\\X001\\'));
  const target = path.join(repository, own.path);
  assert.match(check(file, overlay({ [target]: Buffer.from('// changed after the capture') })).problems.join('\n'), /differs from the input hash recorded when the run was made/);
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
  const input = manifest.inputs.find((item) => item.path.endsWith('timeline.red.test.cjs')).path;
  const weakened = (relative) => (relative === input ? Buffer.from('// weakened') : firstBlob(relative));
  assert.match(check(file, undefined, weakened).problems.join('\n'), /timeline\.red\.test\.cjs: differs from the git blob of the first publication/);
  const exit = Buffer.from(JSON.stringify({ ...manifest, exitCode: 0 }));
  assert.match(check(file, overlay({ [file]: exit })).problems.join('\n'), /exit code/);
  assert.match(check(file, overlay({ [file]: Buffer.from(JSON.stringify({ ...manifest, timedOut: true })) })).problems.join('\n'), /timed out/);
  assert.throws(() => check(file, (target) => { if (target === stdout) throw new Error('missing'); return fs.readFileSync(target); }), /missing/);
  assert.match(check(file, overlay({ [stdout]: Buffer.from('not gzip') })).problems.join('\n'), /not a gzip stream/);
});

test('a browser observation summary pins the exact sources it observed and its DOM snapshot', () => {
  const folders = [path.join(root, 'evidence', 'browser'), path.join(root, 'evidence', 'fix', 'browser')];
  const summaries = folders.filter((folder) => fs.existsSync(folder)).flatMap((folder) => fs.readdirSync(folder).map((name) => path.join(folder, name, 'summary.json')))
    .filter((file) => fs.existsSync(file));
  assert.ok(summaries.some(historical), 'the first-publication observation is archived');
  for (const file of summaries) {
    const summary = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(summary.outcome, 'passed');
    assert.deepEqual([summary.liveAzureResult, summary.packagesDownloaded, summary.cloudRuns, summary.spend], [false, 0, 0, 0]);
    for (const [name, digest] of Object.entries(summary.sourceSha256)) {
      const bytes = historical(file) ? firstBlob(`capability\\X001\\${name}`) : acceptedFixSource(file, name, digest);
      assert.equal(sha(bytes), digest, `${name} differs from the source the browser observed`);
    }
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

test('evidence folders keep their gitattributes and every archived file name is unique within its archive (the first publication and the fix are two archives)', () => {
  assert.equal(fs.readFileSync(path.join(root, 'evidence', '.gitattributes'), 'utf8').trim(), '* -text -diff');
  for (const archive of [manifests().filter(historical), manifests().filter((file) => !historical(file))]) {
    const names = archive.map((file) => path.basename(file));
    assert.ok(names.length > 0);
    assert.equal(new Set(names).size, names.length, 'a recorded run is never overwritten or reused');
  }
  for (const file of manifests()) assert.ok(fs.existsSync(path.join(path.dirname(file), 'raw')), file);
});
