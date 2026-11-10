'use strict';

// Integrity of the evidence of the FIFTH worker's fix (fourth review: D1 to D11; the production bytes are UNCHANGED). The old subject of the new RED is the server of the third fix with the
// generator mutant of review D1 applied (recomputed against git from the entry of tests\mutants-server.cjs, so that the RED and the campaign use the same bytes), the RED is a recorded
// behavioral failure with unchanged inputs, a tamper of it is caught BY NAME, and it REPLAYS both ways: it fails against its old subject and passes UNCHANGED against the final code. The scan
// for local identifiers (rule 15) covers EVERY file added or modified since the sealed evidence, the README and the tests included, and the decompressed gzip transcripts, and finds a planted one.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn, execFileSync } = require('node:child_process');
const { sha, verifyManifest } = require('./evidence-verify.cjs');
const { scan } = require('./identifier-scan.cjs');
const mutants = require('./mutants-server.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const red = path.join(root, 'evidence', 'red');
const PUBLISHED = 'ea81f6ec59c3a9356827724a6b35ca45b1353d46';
const SEALED = 'c2390608feccd87712d0848692b5ad238c5f63d5';
const OPTIONS = { timeout: 600000 };
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: repository, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
const blob = (commit, relative) => git('cat-file', 'blob', `${commit}:${relative}`);
// [tests, pass and fail against the old subject]: the family test of tests\victim.test.cjs.
const RUN = ['run-17', 'victim.test.cjs', 52, 32, 20];

test('the production bytes of this fix are the bytes published in ea81f6ec (the fix changes tests, tools and the README only)', OPTIONS, () => {
  for (const file of ['a11y-check.js', 'journey.js', 'page.js', 'server.cjs', 'transcript.cjs', 'index.html', 'styles.css', 'imports.json']) {
    assert.equal(sha(fs.readFileSync(path.join(root, file))), sha(blob(PUBLISHED, `capability/C059/${file}`)), `${file} is ${file} of ${PUBLISHED.slice(0, 12)}`);
  }
});

test('the old subject of the RED is the server of the third fix with exactly the D1 mutant of the generator applied (decide(socket) deleted from refuseMalformed)', OPTIONS, () => {
  const mutant = mutants.find((item) => item.label.startsWith('decide() on a parse error'));
  assert.ok(mutant, 'the mutant is in the list');
  assert.equal(mutant.equivalent, undefined, 'the mutant is not excused as equivalent: it has to be killed by a named test');
  assert.deepEqual(mutant.suites, ['queued-cancel', 'victim'], 'it is killed by the new individually named family assertions and retains the original victim suite');
  const published = blob(PUBLISHED, 'capability/C059/server.cjs').toString('utf8');
  const eol = published.includes('\r\n') ? '\r\n' : '\n';
  const find = mutant.from.replace(/\n/g, eol);
  assert.equal(published.split(find).length, 2, 'the anchor occurs once');
  assert.equal(fs.readFileSync(path.join(red, 'stubs-10', 'server.cjs'), 'utf8'), published.replace(find, () => mutant.to.replace(/\n/g, eol)), 'stubs-10/server.cjs is the published server with the mutant applied');
});

test(`${RUN[0]}: a recorded behavioral failure (${RUN[4]} of ${RUN[2]} assertions), inputs and transcripts unchanged`, OPTIONS, () => {
  const { manifest, problems, stdout } = verifyManifest(path.join(red, RUN[0], 'red.json'), { root: repository });
  assert.deepEqual(problems, []);
  assert.deepEqual([manifest.exitCode, manifest.expectedExitCode, manifest.timedOut], [1, 1, false]);
  assert.deepEqual([manifest.summary.tests, manifest.summary.pass, manifest.summary.fail], [RUN[2], RUN[3], RUN[4]]);
  assert.equal([...stdout.matchAll(/code: 'ERR_ASSERTION'/g)].length, RUN[4], 'every failure is an assertion about behavior');
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|Cannot find module|SyntaxError|ReferenceError|TypeError/);
  assert.equal(manifest.transcripts.stderr.bytes, 0);
  for (const file of [`tests\\${RUN[1]}`, 'tests\\refusal-table.cjs', 'tests\\subject.cjs', 'tests\\pipelining-support.cjs', 'C059-review-fix4.feature', 'evidence\\red\\stubs-10\\server.cjs']) {
    assert.ok(manifest.inputs.some((input) => input.path.endsWith(file)), `${file} is a recorded input`);
  }
});

test(`${RUN[0]}: a tampered input hash, transcript or summary of the archive is caught by name`, OPTIONS, () => {
  const scratch = path.join(__dirname, 'scratch', `t-${crypto.randomUUID()}`);
  try {
    const dir = path.join(scratch, RUN[0]);
    fs.cpSync(path.join(red, RUN[0]), dir, { recursive: true });
    const manifestPath = path.join(dir, 'red.json');
    const original = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.deepEqual(verifyManifest(manifestPath, { root: repository }).problems, []);
    const flipped = JSON.parse(JSON.stringify(original));
    flipped.inputs[1].rawSha256 = `${flipped.inputs[1].rawSha256.slice(0, 63)}${flipped.inputs[1].rawSha256.endsWith('0') ? '1' : '0'}`;
    fs.writeFileSync(manifestPath, JSON.stringify(flipped));
    assert.deepEqual(verifyManifest(manifestPath, { root: repository }).problems, [`INPUT_CHANGED ${original.inputs[1].path}`]);
    fs.writeFileSync(manifestPath, JSON.stringify({ ...original, summary: { ...original.summary, fail: original.summary.fail + 1 } }));
    assert.deepEqual(verifyManifest(manifestPath, { root: repository }).problems, ['SUMMARY_MISMATCH fail']);
    fs.writeFileSync(manifestPath, JSON.stringify(original));
    const gz = path.join(dir, 'raw', 'red.stdout.raw.gz');
    const bytes = fs.readFileSync(gz);
    bytes[bytes.length - 12] ^= 0xff;
    fs.writeFileSync(gz, bytes);
    assert.ok(verifyManifest(manifestPath, { root: repository }).problems.some((problem) => /^(GZIP_CHANGED|GZIP_CORRUPT|RAW_CHANGED) stdout$/.test(problem)));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
    try { fs.rmdirSync(path.join(__dirname, 'scratch')); } catch { /* another file still uses it, or it is gone */ }
  }
});

// The replays are real runs: one after the other (several node test processes at once starve each other on a busy machine), the first started when the file is loaded.
function replay(env) {
  const clean = { ...process.env, ...env };
  for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete clean[key];
  if (!env.C059_RED_SUBJECT) delete clean.C059_RED_SUBJECT;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=300000', path.join('capability', 'C059', 'tests', RUN[1])], { cwd: repository, env: clean, windowsHide: true });
    const out = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => out.push(chunk));
    const timer = setTimeout(() => child.kill(), 420000);
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, text: Buffer.concat(out).toString('utf8') }); });
  });
}
const failures = (text) => `${(text.match(/^\s*not ok .*$/gm) ?? []).join('\n')}\n${text.slice(-1500)}`;
const old = replay({ C059_RED_SUBJECT: path.join('capability', 'C059', 'evidence', 'red', 'stubs-10') });
const final = old.then(() => replay({}));

test(`${RUN[0]}: the retained RED fails against its old subject (${RUN[4]} of ${RUN[2]}) and passes UNCHANGED against the final code (${RUN[2]} of ${RUN[2]})`, OPTIONS, async () => {
  const before = await old;
  assert.equal(before.status, 1, failures(before.text));
  assert.equal(Number(/^# pass (\d+)$/m.exec(before.text)?.[1]), RUN[3]);
  assert.equal(Number(/^# fail (\d+)$/m.exec(before.text)?.[1]), RUN[4]);
  assert.equal([...before.text.matchAll(/code: 'ERR_ASSERTION'/g)].length, RUN[4]);
  assert.doesNotMatch(before.text, /MODULE_NOT_FOUND|SyntaxError|ReferenceError/);
  const after = await final;
  assert.equal(after.status, 0, failures(after.text));
  assert.match(after.text, new RegExp(`^# pass ${RUN[2]}$`, 'm'));
  assert.match(after.text, /^# fail 0$/m);
  const manifest = JSON.parse(fs.readFileSync(path.join(red, RUN[0], 'red.json'), 'utf8'));
  assert.equal(sha(fs.readFileSync(path.join(__dirname, RUN[1]))), manifest.inputs.find((input) => input.path.endsWith(`tests\\${RUN[1]}`)).rawSha256, `${RUN[1]} is byte-identical to the RED run`);
});

// Every file of the namespace that was added or MODIFIED since the sealed evidence (a different blob than in the sealed commit): the README, the tests and the production files too, not only the
// new files (review D5), and the decompressed gzip transcripts. The sealed evidence of the first publications keeps what it had: a file that is byte-identical to it is not scanned.
function changedSince(commit) {
  const sealed = new Map(git('ls-tree', '-r', commit, '--', 'capability/C059').toString('utf8').split('\n').filter(Boolean).map((line) => { const [meta, file] = line.split('\t'); return [file, meta.split(' ')[2]]; }));
  const entries = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (!(entry.name === 'scratch' && directory === __dirname)) walk(full); continue; }
      const relative = path.relative(repository, full).split(path.sep).join('/');
      const bytes = fs.readFileSync(full);
      const id = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (sealed.get(relative) !== id) entries.push([relative, bytes]);
    }
  };
  walk(root);
  return entries;
}

test('no file added or modified since the sealed evidence carries a local identifier: the README, the modified tests and production files, the new files and every decompressed transcript', OPTIONS, () => {
  const entries = changedSince(SEALED);
  const names = entries.map(([file]) => file);
  assert.ok(entries.length >= 90, `${entries.length} files are in scope`);
  for (const modified of ['capability/C059/README.md', 'capability/C059/server.cjs', 'capability/C059/tests/server.test.cjs', 'capability/C059/tests/lane.test.cjs']) assert.ok(names.includes(modified), `the modified file ${modified} is in scope`);
  assert.ok(names.some((file) => file.endsWith('.gz')), 'the gzip transcripts are in scope');
  assert.deepEqual(scan(entries), []);
});

test('the scan finds a planted identifier BY NAME: in a text file, in a modified file, in a gzip transcript and in a gzip that cannot be read; a clean file is not named', OPTIONS, () => {
  const user = os.userInfo().username;
  const profile = ['C:', 'Users', user, 'repos'].join('\\');
  const trace = ['', 'x', ['.co', 'pilot'].join(''), ['session', 'state'].join('-')].join('/');
  const planted = [
    ['scratch/clean.txt', Buffer.from('nothing local here')],
    ['scratch/readme.txt', Buffer.from(`see ${profile} for the files`)],
    ['scratch/test.cjs', Buffer.from(`const where = '${trace}';`)],
    ['scratch/transcript.stdout.raw.gz', zlib.gzipSync(Buffer.from(`at ${profile}\\capability`))],
    ['scratch/clean.stdout.raw.gz', zlib.gzipSync(Buffer.from('ok 1 - a test'))],
    ['scratch/broken.stdout.raw.gz', Buffer.from('this is not a gzip stream')],
    ['scratch/session.md', Buffer.from(`the run ${['2102', '38f0'].join('')} produced it`)],
  ];
  assert.deepEqual(scan(planted), ['scratch/readme.txt', 'scratch/test.cjs', 'scratch/transcript.stdout.raw.gz', 'scratch/broken.stdout.raw.gz (unreadable gzip)', 'scratch/session.md']);
});
