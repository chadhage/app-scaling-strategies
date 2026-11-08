'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runHermeticChecks, verifyAcceptedSurface } = require('./strict-evidence.cjs');
const { ACCEPTED_COMMIT, sha, normalize } = require('./u041-authority.cjs');
const { fs, path, subject, load, startNode, makeScratch, dispose } = require('./u041-support.cjs');
const { fakeRunner, tapSummary, lcovRecord } = require('./support.cjs');

const tap = (change = {}) => Object.entries({ tests: 8, pass: 8, fail: 0, cancelled: 0, skipped: 0, todo: 0, ...change })
  .map(([key, value]) => `# ${key} ${value}`).join('\n') + '\n';

test('U041 strict evidence enables the actual heavy file and removes nested context, V8 coverage and the capture bypass', () => {
  const outcome = runHermeticChecks({
    env: { NODE_TEST_CONTEXT: 'child-v8', NODE_V8_COVERAGE: 'caller', U009_EVIDENCE_CAPTURE: '1' },
    spawn: (command, args, options) => {
      assert.equal(command, process.execPath);
      assert.deepEqual(args.slice(0, 2), ['--test', '--test-concurrency=1']);
      assert.match(args[2], /fix2-hermetic\.test\.cjs$/);
      assert.equal(options.env.NODE_TEST_CONTEXT, undefined);
      assert.equal(options.env.NODE_V8_COVERAGE, undefined);
      assert.equal(options.env.U009_EVIDENCE_CAPTURE, undefined);
      assert.equal(options.env.U009_HEAVY_HERMETIC, '1');
      assert.equal(Object.hasOwn(options.env, 'NODE_V8_COVERAGE'), true);
      assert.equal('timeout' in options, false);
      return { status: 0, stdout: tap() };
    }
  });
  assert.deepEqual([outcome.tests, outcome.pass, outcome.skipped, outcome.heavy, outcome.capture], [8, 8, 0, true, false]);
});

for (const [label, run] of [
  ['failed tests', { status: 1, stdout: tap({ pass: 7, fail: 1 }) }],
  ['skipped heavy tests', { status: 0, stdout: tap({ pass: 2, skipped: 6 }) }],
  ['empty file', { status: 0, stdout: tap({ tests: 1, pass: 1 }) }],
  ['no summary', { status: 0, stdout: '' }],
  ['spawn failure', { status: null, error: new Error('fixture failure') }]
]) {
  test(`U041 strict evidence refuses ${label}`, () => {
    assert.throws(() => runHermeticChecks({ spawn: () => run }), /strict heavy hermetic checks failed/);
  });
}

test('U041 strict surface compares immutable blobs, not HEAD or live producer bytes', () => {
  const bytes = Buffer.from('accepted\r\n');
  const entry = { path: 'gate.cjs', gitBlobSha256: sha(bytes), crlfToLfSha256: sha(normalize(bytes)) };
  const key = `${ACCEPTED_COMMIT}:testing/coverage/gate.cjs`;
  assert.deepEqual(verifyAcceptedSurface([entry], (keys) => { assert.deepEqual(keys, [key]); return new Map([[key, bytes]]); }), { checked: 1, problems: [] });
  assert.match(verifyAcceptedSurface([entry], () => new Map()).problems[0], /differs from the exact/);
  assert.match(verifyAcceptedSurface([entry], () => new Map([[key, Buffer.from('other')]])).problems[0], /differs from the exact/);
});

test('U041 self-only policy: normal roots preserve caller opt-in, while a self-gate removes an inherited capture bypass', async (t) => {
  const { parseArgs, runGate } = load('gate.cjs');
  const base = makeScratch('u041-env-scope');
  t.after(() => dispose(base));
  for (const [root, env, expectedHeavy, expectedCapture] of [
    [path.join(subject, 'fixtures', 'pass'), {}, undefined, undefined],
    [path.join(subject, 'fixtures', 'pass'), { U009_HEAVY_HERMETIC: '1' }, '1', undefined],
    [subject, { U009_HEAVY_HERMETIC: '0', U009_EVIDENCE_CAPTURE: '1' }, '1', undefined]
  ]) {
    const run = fakeRunner(({ include }) => ({ run: { stdout: tapSummary() }, lcov: lcovRecord(include) }));
    await assert.doesNotReject(() => runGate(parseArgs(['--root', root, '--scratch', base]), {
      fsApi: fs, cwd: base, repoRoot: path.resolve(subject, '..', '..'), env, run, nodeExecutable: 'fixture-node',
      nodeVersion: 'v22.23.4', defaultScratch: base
    }));
    assert.equal(run.calls.length > 0, true);
    for (const call of run.calls) {
      assert.equal(call.options.env.U009_HEAVY_HERMETIC, expectedHeavy);
      assert.equal(call.options.env.U009_EVIDENCE_CAPTURE, expectedCapture);
    }
  }
});

test('U041 public main never rejects and emits one typed document for passing, usage and internal failures', async (t) => {
  const base = makeScratch('u041-main-contract');
  t.after(() => dispose(base));
  const { main } = load('gate.cjs');
  for (const [args, expected] of [
    [['--root', path.join(subject, 'fixtures', 'pass')], 0],
    [['--root', path.join(subject, 'fixtures', 'pass'), '--min', '101'], 2],
    [['--root', path.join(base, 'missing')], 2]
  ]) {
    const stdout = [];
    let status;
    await assert.doesNotReject(async () => {
      status = await main([...args, '--scratch', base], {
        cwd: base, repoRoot: path.resolve(subject, '..', '..'), fsApi: fs, env: {},
        run: fakeRunner(({ include }) => ({ run: { stdout: tapSummary() }, lcov: lcovRecord(include) })),
        stdout: (text) => stdout.push(text), stderr: () => {}
      });
    });
    assert.equal(status, expected);
    assert.equal(stdout.length, 1);
    let document;
    assert.doesNotThrow(() => { document = JSON.parse(stdout[0]); });
    assert.equal(document.schema, 'U009-coverage-gate/1');
    assert.equal(document.pass, expected === 0);
  }
  const stdout = [];
  let exit;
  await assert.doesNotReject(async () => {
    exit = await main(['--root', path.join(subject, 'fixtures', 'pass'), '--scratch', base], {
      cwd: base, repoRoot: path.resolve(subject, '..', '..'), fsApi: fs, env: {},
      run: async () => { throw new Error('owned fixture internal failure'); },
      stdout: (text) => stdout.push(text), stderr: () => {}
    });
  });
  assert.equal(exit, 1);
  assert.doesNotThrow(() => JSON.parse(stdout[0]));
  assert.equal(JSON.parse(stdout[0]).error.type, 'internal');
});

test('U041 production strictness and the complete matcher return contract are observable', () => {
  for (const [file, name] of [['gate.cjs', 'parseArgs'], ['glob.cjs', 'normalizePattern']]) {
    assert.throws(() => Reflect.get(load(file)[name], 'caller'), TypeError, `${file} retains strict function semantics`);
  }
  const { compileGlob } = load('glob.cjs');
  for (const [pattern, input] of [['*', 'aaa'], ['a', 'a'], ['a', 'b'], ['**/', 'a/'], ['?', '/'], ['*', '']]) {
    let matcher;
    let outcome;
    assert.doesNotThrow(() => { matcher = compileGlob(pattern); outcome = matcher.measure(input); });
    assert.deepEqual(Object.keys(outcome).sort(), ['consumed', 'matched', 'steps', 'tokens']);
    assert.equal(typeof outcome.matched, 'boolean');
    assert.equal(Number.isInteger(outcome.steps), true);
    assert.equal(Number.isInteger(outcome.tokens), true);
    assert.equal(Number.isInteger(outcome.consumed), true);
    const baseline = { ...outcome };
    for (const key of Object.keys(outcome)) outcome[key] = null;
    assert.deepEqual(matcher.measure(input), baseline, 'each public data return is independent');
    assert.equal(Object.isFrozen(matcher), true);
    assert.throws(() => { matcher.pattern = 'changed'; }, TypeError);
  }
});

test('U041 guard census: every repeated scalar is a typed refusal, not last-writer-wins', () => {
  const { parseArgs } = load('gate.cjs');
  for (const args of [
    ['--root', 'r', '--min', '85', '--min', '0'],
    ['--root', 'r', '--json', 'a.json', '--json=b.json'],
    ['--root', 'r', '--jobs', '1', '--jobs', '2']
  ]) {
    assert.throws(() => parseArgs(args), (error) => error.code === 'USAGE' && /more than once/.test(error.message));
  }
});

test('U041 guard census: a failed folder removal stops before an unrelated empty neighbour', (t) => {
  const base = makeScratch('u041-folder-order');
  t.after(() => dispose(base));
  const held = path.join(base, 'held');
  const neighbour = path.join(base, 'neighbour');
  fs.mkdirSync(held);
  fs.mkdirSync(neighbour);
  fs.writeFileSync(path.join(held, 'owned.txt'), 'kept');
  load('gate.cjs').removeCreatedFolders([held, neighbour], fs);
  assert.equal(fs.existsSync(neighbour), true);
  assert.equal(fs.readFileSync(path.join(held, 'owned.txt'), 'utf8'), 'kept');
});

test('U041 guard census: command-builder refusals are per-file results, unexpected builder errors keep their exact type', async (t) => {
  const { parseArgs, runGate } = load('gate.cjs');
  const base = makeScratch('u041-builder-errors');
  t.after(() => dispose(base));
  const root = path.join(base, 'fixture');
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(root, 'odd[1].cjs'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(root, 'tests', 't.test.cjs'), "require('node:test')('fixture', () => {});\n");
  const run = fakeRunner(({ include }) => ({ run: { stdout: tapSummary() }, lcov: lcovRecord(include) }));
  const deps = { fsApi: fs, cwd: base, repoRoot: base, env: {}, run, nodeExecutable: 'fixture-node',
    nodeVersion: 'v22.23.4', defaultScratch: base };
  let result;
  await assert.doesNotReject(async () => { result = await runGate(parseArgs(['--root', root, '--scratch', base]), deps); });
  assert.equal(result.exitCode, 1);
  assert.match(result.report.files[0].reason, /Node reads glob characters/);
  assert.equal(run.calls.length, 0);
  const regular = path.join(subject, 'fixtures', 'pass');
  await assert.rejects(() => runGate(parseArgs(['--root', regular, '--scratch', base]), { ...deps, repoRoot: null }),
    (error) => error.code === 'ERR_INVALID_ARG_TYPE', 'an unexpected path-builder error is not swallowed or replaced');
});

test('U041 guard census: every child receives an existing private TEMP/TMP/TMPDIR directory', async (t) => {
  const base = makeScratch('u041-child-temp');
  t.after(() => dispose(base));
  const { parseArgs, runGate } = load('gate.cjs');
  const run = fakeRunner(({ include, options }) => {
    const directory = options.env.TEMP;
    assert.equal(fs.existsSync(directory), true, 'the directory exists before the child is invoked');
    assert.equal(fs.statSync(directory).isDirectory(), true);
    assert.equal(options.env.TMP, directory);
    assert.equal(options.env.TMPDIR, directory);
    return { run: { stdout: tapSummary() }, lcov: lcovRecord(include) };
  });
  await runGate(parseArgs(['--root', path.join(subject, 'fixtures', 'pass'), '--scratch', base]), {
    fsApi: fs, cwd: base, repoRoot: path.resolve(subject, '..', '..'), env: {}, run, nodeExecutable: 'fixture-node',
    nodeVersion: 'v22.23.4', defaultScratch: base
  });
  assert.equal(run.calls.length, 1);
});

test('U041 guard census: help replaces a stale result and internal stderr retains the provided stack', async (t) => {
  const base = makeScratch('u041-help-stack');
  t.after(() => dispose(base));
  const { main } = load('gate.cjs');
  const report = path.join(base, 'help.json');
  fs.writeFileSync(report, '{"schema":"U009-coverage-gate/1","pass":true}\n');
  const stdout = [];
  const stderr = [];
  const io = { cwd: base, fsApi: fs, repoRoot: path.resolve(subject, '..', '..'), env: {},
    stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text) };
  assert.equal(await main(['--help', '--json', report], io), 0);
  assert.equal(JSON.parse(fs.readFileSync(report, 'utf8')).status, 'not-run');
  assert.equal(JSON.parse(fs.readFileSync(report, 'utf8')).pass, false);
  const error = new Error('owned failure');
  error.stack = 'owned synthetic stack';
  assert.equal(await main(['--root', path.join(subject, 'fixtures', 'pass'), '--scratch', base], {
    ...io, run: async () => { throw error; }
  }), 1);
  assert.equal(stderr.at(-1), 'internal error: owned synthetic stack\n');
});

test('U041 guard census: default entry sets the exit code and the real CLI emits a non-vacuous report', async (t) => {
  const { entry } = load('gate.cjs');
  const originalExit = process.exitCode;
  try {
    await entry([], { run: async () => 1, stderr: () => {} });
    assert.equal(process.exitCode, 1);
  } finally { process.exitCode = originalExit; }
  const base = makeScratch('u041-cli-entry');
  t.after(() => dispose(base));
  const child = startNode([path.join(subject, 'gate.cjs'), '--root', path.join(subject, 'fixtures', 'pass'), '--scratch', base], { cwd: base });
  try {
    const run = await child.done;
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim().startsWith('{'), true, 'exit zero without a report is not a pass');
    let report;
    assert.doesNotThrow(() => { report = JSON.parse(run.stdout); });
    assert.deepEqual([report.pass, report.fullBar, report.files.length], [true, true, 1]);
  } finally { await child.close(); }
});

test('U041 remaining guards: external manifests distinguish present and missing files by typed outcome', async (t) => {
  const base = makeScratch('u041-manifest-guard');
  t.after(() => dispose(base));
  const { parseArgs, runGate } = load('gate.cjs');
  const manifest = path.join(base, 'manifest.json');
  fs.writeFileSync(manifest, '{}\n');
  const deps = { cwd: base, repoRoot: path.resolve(subject, '..', '..'), fsApi: fs, env: {},
    run: fakeRunner(({ include }) => ({ run: { stdout: tapSummary() }, lcov: lcovRecord(include) })),
    nodeExecutable: 'fixture-node', nodeVersion: 'v22.23.4', defaultScratch: base };
  await assert.doesNotReject(() => runGate(parseArgs(['--root', path.join(subject, 'fixtures', 'pass'), '--manifest', manifest, '--scratch', base]), deps));
  await assert.rejects(() => runGate(parseArgs(['--root', path.join(subject, 'fixtures', 'pass'), '--manifest', path.join(base, 'missing.json'), '--scratch', base]), deps),
    (error) => error.code === 'USAGE' && /manifest file not found/.test(error.message));
});

test('U041 remaining guards: missing-stack and null errors retain their actual fallback, including entry', async (t) => {
  const base = makeScratch('u041-error-fallback');
  t.after(() => dispose(base));
  const { main, entry } = load('gate.cjs');
  const error = new Error('no stack');
  error.stack = '';
  for (const [failure, expected] of [[error, 'Error: no stack'], [null, 'null']]) {
    const stderr = [];
    await assert.doesNotReject(() => main(['--root', path.join(subject, 'fixtures', 'pass'), '--scratch', base], {
      cwd: base, repoRoot: path.resolve(subject, '..', '..'), fsApi: fs, env: {},
      run: async () => { throw failure; }, stdout: () => {}, stderr: (text) => stderr.push(text)
    }));
    assert.equal(stderr.at(-1), `internal error: ${expected}\n`);
  }
  const stderr = [];
  const exited = [];
  const entryError = new Error('entry failure');
  entryError.stack = 'owned entry stack';
  await assert.doesNotReject(() => entry([], { run: async () => { throw entryError; }, stderr: (text) => stderr.push(text), exit: (code) => exited.push(code) }));
  assert.deepEqual(stderr, ['internal error: owned entry stack\n']);
  assert.deepEqual(exited, [1]);
});

test('U041 remaining guards: library import is silent and globstar tokens and early-exit work are exact', async () => {
  const child = startNode(['--eval', 'require(process.argv[1])', path.join(subject, 'gate.cjs')]);
  try {
    const run = await child.done;
    assert.deepEqual([run.status, run.stdout, run.stderr], [0, '', '']);
  } finally { await child.close(); }
  const { compileGlob } = load('glob.cjs');
  assert.deepEqual(compileGlob('**').measure('x'), { matched: true, steps: 3, consumed: 1, tokens: 1 });
  assert.deepEqual(compileGlob('a').measure(`b${'x'.repeat(5000)}`), { matched: false, steps: 2, consumed: 1, tokens: 1 });
});
