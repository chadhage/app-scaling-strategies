'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildBundle } = require('..\\historical.cjs');
const { hash } = require('..\\pins.cjs');
const root = path.resolve(__dirname, '..', 'evidence', 'raw');
assert.equal(process.argv.length, 2);
assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Trace capture is deliberate, never a normal inspection side effect.');
const directory = path.resolve(process.env.C034_CAPTURE_DIR || '');
assert.equal(path.dirname(directory), root);
assert.match(path.basename(directory), /^trace-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal(fs.realpathSync(directory), directory);
assert.deepEqual(fs.readdirSync(directory), []);
(async () => {
  const bundle = await buildBundle();
  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  const script = `(function(root){'use strict';function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}Object.defineProperty(root,'C034Saved',{value:freeze(${JSON.stringify(bundle).replaceAll('<', '\\u003c')})});}(globalThis));\n`;
  fs.writeFileSync(path.join(directory, 'bundle.json'), json, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'bundle.js'), script, { flag: 'wx' });
  console.log(JSON.stringify({
    traceCapture: 'source-pinned historical C033 DOM, NOT a new live client run',
    saved: path.relative(path.resolve(__dirname, '..', '..', '..'), path.join(directory, 'bundle.json')),
    bundleRawSha256: hash(Buffer.from(json)), browserBundleRawSha256: hash(Buffer.from(script)),
    actualC015ReaderPid: bundle.traces[0].context.receipt.pid,
    actualC015RunId: bundle.traces[0].context.receipt.state.runId,
    actualC015Epoch: bundle.traces[0].context.receipt.state.epoch,
    writesToC015: 0, association: bundle.traces[0].context.association,
    snapshots: bundle.traces.map((entry) => ({ id: entry.id, events: entry.snapshot.events.length, closedOriginals: entry.snapshot.history.length, phase: entry.snapshot.phase }))
  }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
