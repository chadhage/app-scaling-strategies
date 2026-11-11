'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createLoader, PRODUCTION } = require('./u069-loader.cjs');
const { pureCases, pageCases } = require('./u069-probes.cjs');
const { serverCases } = require('./u069-server-probes.cjs');
for (const file of PRODUCTION) {
  test(`U069 pristine current-source behavioral probe control: ${file}`, { timeout: 180000 }, async () => {
    const loader = createLoader();
    const cases = file === 'page.js' ? pageCases(loader, createLoader)
      : file === 'server.cjs' ? serverCases(loader, createLoader) : pureCases(file, loader);
    assert.ok(cases.length > 0);
    for (const entry of cases) {
      loader.resetWork();
      await assert.doesNotReject(async () => entry.run(), `${file}: ${entry.name}`);
      assert.equal(loader.bounded(), true, `${file}: actual loop work remains inside the declared probe bound`);
    }
  });
}
