'use strict';

// The surface of the namespace: pins recomputed against git, imports confined to the pinned files, no wall clock in
// production, a page without inline script, retained evidence recomputed (and shown to fail when tampered), the RED
// replayed unchanged against the final code, and the README's claims.
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const zlib = require('node:zlib');
const { sha, verifyManifest } = require('./evidence.cjs');
const { assert, cleanup, scratch } = require('./support.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const pins = JSON.parse(fs.readFileSync(path.join(root, 'imports.json'), 'utf8'));
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const PRODUCTION = fs.readdirSync(root).filter((name) => /\.c?js$/.test(name)).sort();
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: repository, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));

test('every imported file is pinned and the pins are recomputed against git at the accepted commit, never trusted from the file', { timeout: 60000 }, () => {
  for (const [card, accepted] of Object.entries(pins.accepted)) {
    assert.equal(git('rev-parse', `${accepted.tag}^{commit}`).toString().trim(), accepted.commit, `${card} tag resolves to the accepted commit`);
  }
  assert.equal(Object.keys(pins.imports).length, 6);
  for (const [relative, pin] of Object.entries(pins.imports)) {
    const accepted = pins.accepted[pin.card];
    const blob = git('cat-file', 'blob', `${accepted.commit}:${relative}`);
    assert.equal(sha(blob), pin.acceptedGitSha256, `${relative}: the accepted blob`);
    assert.equal(git('rev-parse', `${accepted.commit}:${relative}`).toString().trim(), pin.gitBlob, `${relative}: the blob id`);
    const canonicalAccepted = sha(lf(blob));
    assert.equal(pin.canonicalLfSha256, canonicalAccepted, `${relative}: the canonical pin is recomputed from the accepted blob`);
    const working = fs.readFileSync(path.join(repository, relative));
    assert.equal(sha(working) === pin.acceptedGitSha256 || sha(lf(working)) === canonicalAccepted, true, `${relative}: the working bytes are the accepted bytes (raw or LF form)`);
    assert.equal(sha(working) === pin.rawSha256 || sha(lf(working)) === pin.canonicalLfSha256, true, `${relative}: the recorded working hashes`);
  }
});

test('production code reads only pinned files of other namespaces, builds its step service from C042 and never reads the wall clock', { timeout: 30000 }, () => {
  const allowed = new Set(Object.keys(pins.imports).map((name) => name.replace(/^capability\//, '')));
  for (const name of PRODUCTION) {
    const source = read(name);
    for (const match of source.matchAll(/require\('(\.\.\/[^']+)'\)/g)) assert.equal(allowed.has(match[1].replace(/^\.\.\//, '')), true, `${name} requires ${match[1]}, which is not pinned`);
    for (const match of source.matchAll(/path\.join\(__dirname, '\.\.', '(C\d+)', '([^']+)'\)/g)) assert.equal(allowed.has(`${match[1]}/${match[2]}`), true, `${name} reads ${match[1]}/${match[2]}`);
    assert.equal(/\bDate\b/.test(source), false, `${name} must not read the wall clock`);
    assert.equal(/\bperformance\b/.test(source) && name !== 'server.cjs', false, `${name}: the monotonic clock is injected, only the composition root reads it`);
    assert.equal(/\beval\(|new Function\(|child_process|node:https?:\/\/(?!127)/.test(source) && !/^(?:server)\.cjs$/.test(name) ? name : 'ok', 'ok', `${name} uses no dynamic code or process`);
  }
  assert.match(read('runner.cjs'), /require\('\.\/preset\.cjs'\)/);
  assert.equal(/engine\.cjs|openEngine/.test(read('runner.cjs')), false, 'the runner never imports or builds a step service of its own');
  assert.match(read('server.cjs'), /openEngine/);
});

test('the page has no inline script or handler, loads the pinned validators first and talks only to its own origin', { timeout: 30000 }, () => {
  const html = read('index.html');
  assert.equal(/<script(?![^>]*\bsrc=)/.test(html), false);
  assert.equal(/\son[a-z]+=/.test(html), false);
  assert.deepEqual([...html.matchAll(/<script defer src="([^"]+)"/g)].map((match) => match[1]), ['c042-contract.js', 'contract.js', 'validate.js', 'envelope.js', 'verify.js', 'page.js']);
  assert.equal(/https?:\/\//.test(read('page.js')), false, 'no absolute URL in the page script');
  assert.equal(/innerHTML|insertAdjacentHTML|document\.write|eval\(/.test(read('page.js')), false, 'the page builds text nodes only');
});

test('the first RED run is retained and recomputed, and the transcript tamperings that keep its hashes consistent are named failures', { timeout: 60000 }, () => {
  const red = path.join(root, 'evidence', 'red', 'red-01', 'red-initial.json');
  assert.deepEqual(verifyManifest(red, repository), [], 'the files of the first RED are unchanged');
  const manifest = JSON.parse(fs.readFileSync(red, 'utf8'));
  assert.deepEqual([manifest.exitCode, manifest.expectedExitCode, manifest.summary.fail > 0, manifest.summary.pass], [1, 1, true, 0]);
  assert.equal(manifest.summary.tests, manifest.summary.fail);
  assert.equal(manifest.environmentAdded.includes('C043_RED_SUBJECT'), true);
  const out = scratch();
  try {
    const copy = path.join(out, 'red');
    fs.cpSync(path.dirname(red), copy, { recursive: true });
    const target = path.join(copy, path.basename(red));
    const original = fs.readFileSync(target, 'utf8');
    const gz = path.join(copy, manifest.transcripts.stdout.path);
    const tampers = [
      ['a changed input hash', () => fs.writeFileSync(target, original.replace(manifest.inputs[0].rawSha256, '0'.repeat(64))), 'differs from the recorded bytes'],
      ['a flipped byte in a transcript', () => { const bytes = fs.readFileSync(gz); bytes[bytes.length - 12] ^= 1; fs.writeFileSync(gz, bytes); }, 'transcript bytes changed'],
      ['a rewritten transcript with a fixed zip hash', () => { fs.writeFileSync(gz, zlib.gzipSync(Buffer.from('ok 1 - everything passed'))); fs.writeFileSync(target, original.replace(manifest.transcripts.stdout.gzipSha256, sha(fs.readFileSync(gz)))); }, 'content differs from the recorded hash'],
      ['a missing transcript', () => fs.rmSync(gz), 'is missing'],
    ];
    for (const [name, change, expected] of tampers) {
      fs.cpSync(path.dirname(red), copy, { recursive: true, force: true });
      fs.writeFileSync(target, original);
      change();
      const problems = verifyManifest(target, repository);
      assert.equal(problems.some((problem) => problem.includes(expected)), true, `${name}: ${problems.join('; ')}`);
    }
  } finally {
    cleanup(out);
  }
});

test('the RED fails against the behaviorless stubs and passes unchanged against the final code (L-0121)', { timeout: 120000 }, () => {
  const run = (env) => {
    const clean = { ...process.env, ...env };
    for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'NODE_OPTIONS', 'C043_MUTANT']) delete clean[key];
    if (!env.C043_RED_SUBJECT) delete clean.C043_RED_SUBJECT;
    return spawnSync(process.execPath, ['--test', '--test-concurrency=1', path.join(root, 'evidence', 'red', 'initial-a.snapshot.cjs'), path.join(root, 'evidence', 'red', 'initial-b.snapshot.cjs')],
      { cwd: repository, env: clean, encoding: 'utf8', timeout: 100000, windowsHide: true });
  };
  const red = run({ C043_RED_SUBJECT: path.join(root, 'evidence', 'red', 'stubs') });
  assert.equal(red.status, 1);
  assert.match(red.stdout, /# fail 31/);
  assert.equal(/Cannot find module|SyntaxError|ReferenceError/.test(red.stdout + red.stderr), false, 'the RED fails for behavior, not for a missing module or a syntax error');
  assert.equal(/expected: \d+\s+actual: 501/.test(red.stdout), true, 'an assertion about the specified behavior');
  const green = run({});
  assert.equal(green.status, 0, green.stdout.slice(-2000));
  assert.match(green.stdout, /# pass 31/);
});

test('the README carries the exact commands and the honest limits, the feature came first and the files keep their bytes', { timeout: 30000 }, () => {
  const readme = read('README.md');
  for (const phrase of ['node capability\\C043\\server.cjs', 'C043_RED_SUBJECT', 'node capability\\C043\\tests\\coverage.cjs', 'node capability\\C043\\tests\\browser.cjs', 'MUTANTS:',
    'only GET', 'C017', 'not the approved Node.js 24', 'discarded tail', 'external anchor', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'equivalent mutant', 'same steps',
    'C043-review-fixes.feature', 'C043-node-own.feature', 'PRESET_STEP_SERVICE_DISAGREES', 'closed vocabulary', 'per drive', 'consistent rewrite', 'maxRequestsPerSocket', 'HTTP/1.0',
    'C043-r3-load.feature', 'C043-r3-connect.feature', 'C043-r3-hardening.feature', 'C043-r3-aliasing.feature', 'tests\\fresh-tree.cjs', 'tests\\mutgen.cjs', 'tests\\loop.cjs', 'What was not probed']) {
    assert.equal(readme.includes(phrase), true, `README lacks: ${phrase}`);
  }
  const feature = read('C043.feature');
  for (const scenario of ['An invalid preset is a typed failure', 'The automatic runner invokes the same validated steps as manual operation', 'Cancellation is explicit', 'never re-executes an acknowledged step']) {
    assert.equal(feature.includes(scenario), true, scenario);
  }
  assert.equal(read('.gitattributes').startsWith('* -text'), true);
  assert.match(read('.gitignore'), /tests\/scratch\//);
});
