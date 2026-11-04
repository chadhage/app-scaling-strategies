'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { readCurrent } = require('..\\current.cjs');
const { checkPublisher } = require('..\\pins.cjs');
const root = path.resolve(__dirname, '..');
if (process.argv.length !== 2 || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Exact deliberate capture required; never refresh a bundled snapshot.');
const directory = path.resolve(process.env.C036_CAPTURE_DIR || '');
assert.equal(path.dirname(directory), path.join(root, 'evidence', 'raw'));
assert.match(path.basename(directory), /^context-[0-9a-f-]{36}$/);
assert.deepEqual(fs.readdirSync(directory), []);
assert.equal(fs.realpathSync(directory), directory);
async function main() {
  const actual = await readCurrent();
  const boundary = checkPublisher();
  fs.writeFileSync(path.join(directory, 'actual-context.json'), `${JSON.stringify(actual, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'publisher-boundary.json'), `${JSON.stringify(boundary, null, 2)}\n`, { flag: 'wx' });
  const captured = {
    cardId: 'C036', capturedAtUtc: new Date().toISOString(),
    interpretation: 'Bundled historical actual C015 read; browser has no live disk, consent, authentication or lease authority.',
    context: { ...actual, contextOrigin: 'bundled-historical-C015-observation-only' }
  };
  const script = `(function (root) {\n  'use strict';\n  function freeze(value) {\n    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }\n    return value;\n  }\n  Object.defineProperty(root, 'C036Captured', { value: freeze(${JSON.stringify(captured, null, 2)}) });\n}(globalThis));\n`;
  fs.writeFileSync(path.join(root, 'captured.js'), script, { flag: 'wx' });
  fs.writeFileSync(path.join(root, 'publisher-boundary.json'), `${JSON.stringify(boundary, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({
    actualReaderPid: actual.receipt.pid, runId: actual.receipt.state.runId, epoch: actual.receipt.state.epoch,
    record: actual.receipt.state.record, writesPerformed: actual.receipt.writesPerformed,
    browserContext: 'historical bundled observation, not live disk or authority',
    currentPublisherRawSha256: boundary.actualSha256, directSourcePins: actual.directDependenciesVerified,
    underlyingSourcePins: actual.underlyingC034DependenciesVerified
  }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
