'use strict';

// F3 of the independent review of U009: a previous pass:true report must never survive a failed invocation that names the same --json path.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixtureRoot, makeScratch, dispose } = require('./support.cjs');
const { runGateCli, readJson, relativeToRepository } = require('./clisupport.cjs');

const state = { scratch: null, steps: {} };

test.before(async () => {
  state.scratch = makeScratch('f3');
  const target = path.join(state.scratch, 'report.json');
  const gateScratch = path.join(state.scratch, 'gate-scratch');
  const root = relativeToRepository(fixtureRoot('pass'));
  const inTheWay = path.join(state.scratch, 'a-file-not-a-directory');
  fs.writeFileSync(inTheWay, 'in the way\n');
  const step = async (name, args, env) => {
    const run = await runGateCli(args, { env, timeout: 120000 });
    state.steps[name] = { run, written: fs.existsSync(target) ? readJson(target) : null };
  };
  await step('pass', ['--root', root, '--scratch', gateScratch, '--json', target]);
  await step('usageAfterPass', ['--root', root, '--min', '101', '--json', target]);
  await step('passAgain', ['--root', root, '--scratch', gateScratch, '--json', target]);
  await step('crashAfterPass', ['--root', root, '--scratch', inTheWay, '--json', target], { NODE_OPTIONS: '--unhandled-rejections=warn' });
  await step('passThird', ['--root', root, '--scratch', gateScratch, '--json', target]);
  await step('usageBeforeJsonFlag', ['--root', root, '--min', 'abc', '--json', target]);
  await step('passFourth', ['--root', root, '--scratch', gateScratch, '--json', target]);
  await step('usageAfterJsonFlag', ['--json', target, '--bogus']);
});

test.after(() => {
  if (state.scratch) dispose(state.scratch);
});

test('the reused path holds the pass report of a successful run', () => {
  for (const name of ['pass', 'passAgain', 'passThird', 'passFourth']) {
    assert.equal(state.steps[name].run.status, 0, name);
    assert.equal(state.steps[name].written.pass, true, name);
  }
});

test('a usage error leaves a failure report at the path, never the previous pass', () => {
  const { run, written } = state.steps.usageAfterPass;
  assert.equal(run.status, 2);
  assert.notEqual(written, null, 'the path must hold the report of this invocation');
  assert.equal(written.pass, false, 'a stale pass:true must not survive a failed invocation');
  assert.equal(written.error.code, 'USAGE');
  assert.match(written.error.message, /--min must be an integer/);
});

test('a crash leaves a typed internal failure report at the path, never the previous pass', () => {
  const { run, written } = state.steps.crashAfterPass;
  assert.equal(run.status, 1);
  assert.notEqual(written, null);
  assert.equal(written.pass, false);
  assert.equal(written.error.type, 'internal');
});

test('the path is protected whichever order the flags come in', () => {
  for (const name of ['usageBeforeJsonFlag', 'usageAfterJsonFlag']) {
    const { run, written } = state.steps[name];
    assert.equal(run.status, 2, name);
    assert.notEqual(written, null, name);
    assert.equal(written.pass, false, name);
    assert.equal(written.error.code, 'USAGE', name);
  }
});
