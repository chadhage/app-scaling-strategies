'use strict';

const assert = require('node:assert/strict');
const { createRunner } = require('./u060-mutation-runner.cjs');
async function main() {
  const runner = createRunner({ progress() {} });
  const result = await runner.runNode(['--test', '--test-concurrency=1', 'tests/u060-startup.fixture.cjs'], {}, 120000);
  assert.equal(result.code, 0, 'the real Node test worker must not start before recorded owner identity and readiness');
  assert.equal(result.timedOut, false);
  assert.equal(result.cleanup.clean, true);
  console.log('ok 1 - U060 actual Node test startup is gated by a recorded owner identity');
  console.log('# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0');
}
main().catch((error) => {
  console.log('not ok 1 - U060 actual Node test startup is gated by a recorded owner identity');
  console.log('# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0');
  console.error(`${error.code ?? error.name}: ${error.message}`);
  process.exitCode = 1;
});
