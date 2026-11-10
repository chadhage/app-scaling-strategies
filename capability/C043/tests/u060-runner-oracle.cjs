'use strict';

const { CURRENT, ORIGINAL, assertNoTimeoutKill } = require('./u060-runner-fixture.cjs');
async function main() {
  await assertNoTimeoutKill(process.argv.includes('--original') ? ORIGINAL : CURRENT);
  console.log('ok 1 - U060 a timer-expired child is undecided even with a named partial assertion');
  console.log('# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0');
}
main().catch((error) => {
  console.log('not ok 1 - U060 a timer-expired child is undecided even with a named partial assertion');
  console.log('# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0');
  console.error(`${error.code ?? error.name}: ${error.message}`);
  process.exitCode = 1;
});
