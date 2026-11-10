'use strict';

const { CURRENT, ORIGINAL, exercise, assertObserved } = require('./u059-stall-fixture.cjs');
try {
  const result = exercise(process.argv.includes('--original') ? ORIGINAL : CURRENT);
  console.log(`INJECTED_CLOCK before-arm calls=${result.unarmedClockCalls}; after-arm calls=${result.armedClockCalls}; no native clock or browser used`);
  assertObserved(result);
  console.log('ok 1 - U059 requested stalls are observed exactly once after explicit arming');
  console.log('# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0');
} catch (error) {
  console.log('not ok 1 - U059 requested stalls are observed exactly once after explicit arming');
  console.log('# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0');
  console.error(`${error.code ?? error.name}: ${error.message}`);
  process.exitCode = 1;
}
