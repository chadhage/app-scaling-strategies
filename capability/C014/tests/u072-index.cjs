'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const old = path.resolve(process.argv[2]);
const oldNS = path.join(old, 'capability', 'C014');
const area = path.join(ROOT, 'evidence', 'u072');
const file = path.join(area, 'catalog.json');
const catalog = JSON.parse(fs.readFileSync(file));
assert.ok(!catalog.retained, 'retained role index is created once');
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence', 'final-20261110', 'baseline-index.json')));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
catalog.retained = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['u072', 'raw', 'scratch'].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) { walk(target); continue; }
    if (!entry.name.endsWith('.json')) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(target)); } catch { continue; }
    if (!data.transcripts) continue;
    const name = path.relative(ROOT, target).replace(/\\/g, '/');
    const bytes = fs.readFileSync(target);
    const original = fs.readFileSync(path.join(oldNS, name));
    assert.ok(bytes.equals(original), 'no copied original manifest is rewritten or recertified');
    catalog.retained.push({ path: name, sha256: hash(bytes), role: base.files[name] ? 'inherited tracked historical capture' : 'retained private-build historical byte-copy',
      sourceQualified: false, observedExitCode: data.exitCode, expectedExitAtOriginalAttempt: data.expectedExitCode,
      timedOutAtOriginalAttempt: data.timedOut, inputDigests: (data.inputs || []).map((input) => ({ ...input,
        role: 'original historical input digest; not an assumed current public file' })) });
  }
}
walk(path.join(ROOT, 'evidence'));
const curated = path.join(ROOT, catalog.mutation.curated);
const curatedData = JSON.parse(fs.readFileSync(curated));
const oldCapture = JSON.parse(fs.readFileSync(path.join(old, 'private-evidence', 'final-captures', 'curated-final-01', 'curated-final-01.json')));
curatedData.transport.consumedInputs = oldCapture.inputs;
fs.writeFileSync(curated, JSON.stringify(curatedData, null, 2) + '\n');
fs.writeFileSync(file, JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({ retainedHistoricalCaptures: catalog.retained.length, privateMissingFilesAssumedPublic: 0 }));
