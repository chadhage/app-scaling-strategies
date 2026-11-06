'use strict';

// F2 of the independent review of U009: an internal error must never end as exit 0. The old entry point ended with main().then(...) and no catch,
// so a non-usage error became an unhandled rejection, and NODE_OPTIONS=--unhandled-rejections=warn|none turned it into exit 0 with empty stdout.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixtureRoot, makeScratch, dispose } = require('./support.cjs');
const { runGateCli, relativeToRepository } = require('./clisupport.cjs');

const modes = ['', '--unhandled-rejections=warn', '--unhandled-rejections=none', '--unhandled-rejections=strict'];
const state = { scratch: null, runs: {} };

test.before(async () => {
  state.scratch = makeScratch('f2');
  const notADirectory = path.join(state.scratch, 'a-file-not-a-directory');
  fs.writeFileSync(notADirectory, 'in the way\n');
  const root = relativeToRepository(fixtureRoot('pass'));
  const entries = await Promise.all(modes.map(async (mode) => [
    mode, await runGateCli(['--root', root, '--scratch', notADirectory], { env: { NODE_OPTIONS: mode === '' ? undefined : mode }, timeout: 120000 })
  ]));
  state.runs = Object.fromEntries(entries);
});

test.after(() => {
  if (state.scratch) dispose(state.scratch);
});

for (const mode of modes) {
  test(`an internal error exits 1 with a typed failure report (NODE_OPTIONS ${mode === '' ? 'unset' : mode})`, () => {
    const run = state.runs[mode];
    assert.equal(run.timedOut, false);
    assert.equal(run.status, 1, 'exit 0 only on pass: an error of the gate itself is a failure');
    assert.notEqual(run.report, null, `stdout must be one JSON document, got: ${JSON.stringify(run.stdout)}`);
    assert.equal(run.report.pass, false);
    assert.equal(run.report.schema, 'U009-coverage-gate/1');
    assert.equal(run.report.error.type, 'internal');
    assert.match(run.report.error.code, /^[A-Z_0-9]+$/);
    assert.match(run.report.error.message, /EEXIST|ENOTDIR|not a directory|already exists/i);
    assert.match(run.stderr, /internal error/i);
  });
}
