'use strict';

const assert = require('node:assert/strict');
const { CURRENT, ORIGINAL, drive, assertAdmitted } = require('./u058-driver-fixture.cjs');

async function main() {
  const result = await drive(process.argv.includes('--original') ? ORIGINAL : CURRENT);
  assert.equal(result.report.ok, true, JSON.stringify(result.report.reasonCodes));
  assert.equal(result.report.signature.publisher, 'Microsoft Corporation');
  assert.equal(result.report.version, '157.0.4341.42');
  assert.equal(result.report.qualifiedVia, 'addendum');
  assert.deepEqual(result.report.reasonCodes, []);
  console.log('QUALIFIED_FIXTURE Microsoft-signed 157.0.4341.42 via addendum; no installed binary inspected');
  assertAdmitted(result);
  console.log('ok 1 - U058 fixture-qualified signed157 crosses driver admission and closes its fixtures');
  console.log('# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0');
}

main().catch((error) => {
  console.log('not ok 1 - U058 fixture-qualified signed157 crosses driver admission and closes its fixtures');
  console.log('# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0');
  console.error(`${error.code ?? error.name}: ${error.message}`);
  process.exitCode = 1;
});
