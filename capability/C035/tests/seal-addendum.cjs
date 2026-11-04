'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = require('..\\source.cjs');
const evidence = require('./evidence.cjs');
if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1' || process.argv.length !== 3 || !/^dd49966d[0-9a-f]{32}$/.test(process.argv[2])) {
  throw new Error('Exact guarded addendum capture with the sealed predecessor commit only.');
}
const { expected, addenda } = evidence.expectedFiles();
const skipped = (file) => file === 'evidence-index.json' || /^evidence-index-addendum-[1-9][0-9]*\.json$/.test(file) ||
  file.startsWith('evidence\\raw\\') || /^publication-result-[0-9a-f-]{36}\.json$/.test(file) ||
  /^evidence\\publication-[0-9a-f-]{36}\\/.test(file) || file.startsWith('tests\\scratch\\');
const supersedes = [];
const adds = [];
for (const file of evidence.files()) {
  if (skipped(file)) continue;
  const bytes = evidence.read(file);
  const current = { rawSha256: source.hash(bytes), byteLength: bytes.length };
  const pin = expected.get(file);
  if (!pin) adds.push({ path: file, ...current });
  else if (pin.rawSha256 !== current.rawSha256) {
    assert.equal(file.startsWith('evidence\\'), false, `Sealed evidence and RED are never superseded: ${file}`);
    supersedes.push({ path: file, previousRawSha256: pin.rawSha256, previousByteLength: pin.byteLength, ...current });
  }
}
assert.ok(supersedes.length + adds.length > 0, 'There is nothing new to record.');
const sequence = addenda.length + 1;
const file = path.join(evidence.root, `evidence-index-addendum-${sequence}.json`);
fs.writeFileSync(file, `${JSON.stringify({
  schema: 'C035-evidence-index-addendum/1', cardId: 'C035', workerId: 'worker-C035', sequence,
  capturedAtUtc: new Date().toISOString(), exactCapture: 'CAPTURE_BROWSER_EVIDENCE=1',
  policy: 'The sealed index and every raw capture, RED and failure stay immutable. This addendum records only later source, tooling and documentation bytes and new files; previous bytes remain in the named commit.',
  reason: 'Hermetic foreign-index repair: the live-index pin could not hold after the unscoped commit; plus per-file 85/85/85 tests, wrapper guard and documentation.',
  previousBytesCommit: process.argv[2],
  baseIndexRawSha256: source.hash(evidence.read('evidence-index.json')),
  previousAddendumRawSha256: addenda.at(-1)?.rawSha256 ?? null,
  supersedes, adds, extraCredits: 0
}, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ sequence, file: path.relative(source.repository, file), superseded: supersedes.map((entry) => entry.path),
  added: adds.map((entry) => entry.path), proof: evidence.checkIndex() }));
