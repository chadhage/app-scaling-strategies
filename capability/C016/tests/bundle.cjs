'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, sha } = require('./provenance.cjs');
const [file, ...extra] = process.argv.slice(2);
if (extra.length || !/^journeys-[0-9a-f-]{36}\.raw\.json$/.test(file)) throw new Error('Supply the exact owned successful journeys raw report only.');
const report = JSON.parse(fs.readFileSync(path.join(root, 'evidence', file), 'utf8'));
assert.equal(report.exitCode, 0);
const bytes = fs.readFileSync(path.join(root, 'evidence', report.stdout.file));
assert.equal(sha(bytes), report.stdout.sha256);
const value = JSON.parse(bytes);
assert.equal(value.cases.length, 5);
assert.equal(value.kind, 'actual-fresh-node-local-command-observations');
for (const item of value.cases) {
  assert.equal(item.exactOwnedScratchCleaned, true);
  require('..\\journal.js').replay(item.entries);
}
const source = `(function (root, factory) {\n  'use strict';\n  if (typeof module === 'object' && module.exports) module.exports = factory();\n  else Object.defineProperty(root, 'C016Observations', { value: factory() });\n}(globalThis, function () {\n  'use strict';\n  function freeze(value) {\n    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }\n    return value;\n  }\n  return freeze(${JSON.stringify(value, null, 2)});\n}));\n`;
fs.writeFileSync(path.join(root, 'observations.js'), source, { flag: 'wx' });
console.log(JSON.stringify({ bundledFrom: file, rawStdoutSha256: sha(bytes), historicalOnly: true, actualFilesystemOperationNow: false }));
