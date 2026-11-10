'use strict';

// U039 fix 4: the evidence of the fourth fix (evidence\u039-incomplete-bodies), checked without git. The chain itself (addendum 3, its supersessions, the
// retained copies of the replaced bytes) is verified by u039-evidence.test.cjs; this file checks what the archives SAY: the RED fails for the behavioural
// reason of finding F1 (assertions about answers and closed connections, no TypeError), the four rows that must not change pass on the retained bytes, and the
// GREEN, coverage, mutation, loop, tree and browser runs are clean. The RED also replays here against the retained bytes of the published second fix.
// With U039_STRICT_EVIDENCE=1 (the check of the final tree) every kind of capture must exist and U039.md must quote the figures of the archived RED and GREEN.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const zlib = require('node:zlib');
const lib = require('./u039-lib.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const DIR = path.join(root, 'evidence', 'u039-incomplete-bodies');
const RETAINED = 'capability/C042/evidence/u039-incomplete-bodies/server.v3-published-146d8f0.cjs.txt';
// The server.cjs of commit 146d8f0 (the published second fix), raw and with CRLF turned into LF (a converted tree).
const V3_SHA256 = '1f7b61fc34d183d9e13d53d2c9e9614059676d29005a1b8a790751960e55ae8f';
const V3_LF_SHA256 = '1f7d382c11f26f64f91bf8255ac93376ee69a39295cbc3b78422205003d7154e';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lfOf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const strict = () => process.env.U039_STRICT_EVIDENCE === '1';
// The five rows that must NOT change: they pass on the published second fix and on the fourth.
const MUST_PASS = ['a request whose message is complete (a Content-Length body)', 'a request whose message is complete (a chunked body)', 'a refused connection is destroyed at the flush', 'a body that arrives slowly is not refused', 'a queued request whose body is still arriving when its turn comes is served'];

// Only an addendum that indexes THIS directory retains attempts here: the capture names repeat between the evidence directories of different fixes.
function retainedNames() {
  const names = new Set();
  for (let sequence = 1; fs.existsSync(path.join(root, `evidence-addendum-${sequence}.json`)); sequence += 1) {
    const addendum = JSON.parse(fs.readFileSync(path.join(root, `evidence-addendum-${sequence}.json`), 'utf8'));
    if ((addendum.evidence ?? []).some((item) => item.path.includes('/evidence/u039-incomplete-bodies/'))) for (const name of addendum.retainedAttempts ?? []) names.add(name);
  }
  return names;
}
const stdoutOf = (manifest) => zlib.gunzipSync(fs.readFileSync(path.join(DIR, manifest.transcripts.stdout.path.replaceAll('\\', '/')))).toString('utf8');
const titles = (out, pattern) => [...out.matchAll(pattern)].map((match) => match[1].trim());
function manifests() {
  const retained = retainedNames();
  return fs.readdirSync(DIR).filter((name) => /^[a-z-]+-\d+-.*\.json$/.test(name)).map((name) => JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'))).filter((manifest) => !retained.has(manifest.name));
}

test('the retained bytes are the server.cjs of the published second fix (commit 146d8f0)', () => {
  const bytes = fs.readFileSync(path.join(repository, RETAINED));
  assert.equal(sha(bytes) === V3_SHA256 || sha(lfOf(bytes)) === V3_LF_SHA256, true);
});

test('the RED of the fourth fix replays against the retained bytes: the incomplete-body rows fail on them, the five rows that must not change pass', { timeout: 1000000 }, () => {
  const names = ['incomplete in-process h11 \\[(X|GX|GGX)\\] (bad-chunk-size|short-body-fin):', 'incomplete separate-process h10 \\[X\\] missing-crlf-after-chunk:', 'a burst of 128 sockets that each send a bad chunk size \\(in-process\\)',
    'an incomplete request queued behind a request in flight is dropped after its turn', 'a GET with a broken chunked body queued behind', 'the refusal for an incomplete request waits only', ...MUST_PASS.map((name) => name.replace(/[()]/g, '\\$&'))];
  const env = lib.childEnv({ U039_SUBJECT: `file:${RETAINED}`, U039_CLOSE_MS: '1500' });
  delete env.CAPTURE_BROWSER_EVIDENCE;
  const files = ['u039-body.test.cjs', 'u039-body-order.test.cjs'].map((file) => path.join('capability', 'C042', 'tests', file));
  const red = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...names.map((name) => `--test-name-pattern=${name}`), ...files], { cwd: repository, env, encoding: 'utf8', timeout: 900000, windowsHide: true });
  assert.equal(red.status, 1, red.stdout.slice(-400));
  const failed = titles(red.stdout, /^not ok \d+ - (.+)$/gm);
  const passed = titles(red.stdout, /^ok \d+ - (.+)$/gm);
  assert.equal(failed.length >= 11, true, `${failed.length} failing tests: ${failed.join(' | ').slice(0, 300)}`);
  assert.equal((red.stdout.match(/code: 'ERR_ASSERTION'/g) ?? []).length >= failed.length, true, 'every failure is an assertion');
  assert.doesNotMatch(red.stdout, /TypeError|ReferenceError|SyntaxError|Cannot find module/);
  for (const name of MUST_PASS) assert.equal(passed.some((title) => title.startsWith(name)), true, `${name} must pass on the retained bytes`);
});

test('every archived run of the fourth fix is clean (RED: assertions only; GREEN, coverage, mutation, loop, tree and browser runs)', () => {
  const kinds = new Map();
  for (const manifest of manifests()) {
    const out = stdoutOf(manifest);
    const kind = manifest.name.split('-')[0];
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    assert.equal(manifest.exitCode, manifest.expectedExitCode, manifest.name);
    if (kind === 'red') {
      const failed = titles(out, /^not ok \d+ - (.+)$/gm);
      const passed = titles(out, /^ok \d+ - (.+)$/gm);
      assert.equal(manifest.exitCode, 1, manifest.name);
      assert.equal(failed.length >= 99, true, `${manifest.name}: ${failed.length} failing tests`);
      assert.equal((out.match(/code: 'ERR_ASSERTION'/g) ?? []).length >= failed.length, true, `${manifest.name}: every failure is an assertion`);
      assert.doesNotMatch(out, /TypeError|ReferenceError|SyntaxError|Cannot find module|ERR_MODULE_NOT_FOUND/);
      assert.equal(passed.length, MUST_PASS.length, `${manifest.name}: only the rows that must not change pass (${passed.join(' | ')})`);
      for (const name of MUST_PASS) assert.equal(passed.some((title) => title.startsWith(name)), true, `${manifest.name}: ${name}`);
    } else if (kind === 'green' || kind === 'tree') {
      if (kind === 'tree') {
        // A converted tree: the ONLY failure is the sealed surface.test.cjs test that pins the raw bytes of sealed RED evidence (it fails identically on the accepted bytes alone).
        assert.equal(manifest.summary.fail, 1, manifest.name);
        assert.deepEqual(manifest.summary.notOk, ['the retained RED is behavioral, was archived before any production file existed, and its inputs are unchanged'], manifest.name);
      } else {
        assert.equal(manifest.summary.fail, 0, manifest.name);
        assert.equal(manifest.summary.pass, manifest.summary.tests, manifest.name);
      }
      assert.equal(manifest.summary.tests >= 500, true, `${manifest.name}: ${manifest.summary.tests} tests`);
    } else if (kind === 'coverage') {
      assert.equal(manifest.summary.coverageRows.length >= 1, true, manifest.name);
      for (const row of manifest.summary.coverageRows) assert.equal(row.lines >= 85 && row.branches >= 85 && row.functions >= 85, true, `${manifest.name}: ${JSON.stringify(row)}`);
    } else if (kind === 'mutants') {
      const summary = JSON.parse([...out.matchAll(/^(\{"summary":true.*\})$/gm)].at(-1)[1]);
      assert.equal(summary.problems ?? summary.survivors, 0, `${manifest.name}: ${JSON.stringify(summary)}`);
    } else if (kind === 'loop') {
      const summary = JSON.parse([...out.matchAll(/^(\{"summary":true.*\})$/gm)].at(-1)[1]);
      assert.equal(summary.failedRuns, 0, manifest.name);
      assert.equal(summary.runs >= 20 && summary.burners >= 4 && summary.burnerPids.length === summary.burners, true, `${manifest.name}: ${JSON.stringify(summary)}`);
    } else if (kind === 'browser') {
      assert.match(out, /C042 browser: 10 checks passed/, manifest.name);
    }
  }
  if (strict()) {
    for (const kind of ['red', 'green', 'coverage', 'mutants', 'loop', 'tree', 'browser']) assert.equal((kinds.get(kind) ?? 0) >= 1, true, `strict evidence: a ${kind} run of the fourth fix must be archived`);
    assert.equal(manifests().filter((manifest) => manifest.name.startsWith('tree-')).length >= 2, true, 'strict evidence: a tree in LF and one in CRLF');
    assert.equal(manifests().some((manifest) => manifest.name.startsWith('mutants-gen-')), true, 'strict evidence: the systematic generator ran');
  }
});

test('U039.md quotes the figures of the archived RED and GREEN of the fourth fix (strict run)', () => {
  if (!strict()) return;
  const notes = fs.readFileSync(path.join(root, 'U039.md'), 'utf8');
  const current = manifests();
  for (const manifest of current.filter((item) => item.name.startsWith('red-'))) assert.equal(notes.includes(`RED figures of the fourth fix: ${manifest.summary.tests} tests, ${manifest.summary.fail} fail, ${manifest.summary.pass} pass`), true, `U039.md quotes ${manifest.name}`);
  for (const manifest of current.filter((item) => item.name.startsWith('green-'))) assert.equal(notes.includes(`GREEN figures of the fourth fix: ${manifest.summary.pass} of ${manifest.summary.tests} tests pass`), true, `U039.md quotes ${manifest.name}`);
});
