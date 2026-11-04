'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { cases, observeCase } = require('./fixtures.cjs');
const { canonical } = require('..\\errors.js');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

(async () => {
  assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1');
  const directory = process.env.C019_CAPTURE_DIRECTORY;
  assert.equal(typeof directory, 'string');
  assert.equal(path.dirname(directory), path.resolve(__dirname, '..', 'evidence'));
  assert.match(path.basename(directory), /^fixtures-[0-9a-f-]{36}$/);
  assert.equal(fs.statSync(directory).isDirectory(), true);
  const capturedAtUtc = new Date().toISOString();
  const records = [];
  function save(name, bytes) {
    fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx' });
    return { file: name, bytes: bytes.length, sha256: sha(bytes) };
  }
  function archive(name, bytes) {
    return { ...save(`${name}.gz`, gzipSync(bytes)), originalBytes: bytes.length, originalSha256: sha(bytes) };
  }
  for (const config of cases) {
    const actual = await observeCase(config);
    const processes = actual.processes.map((process, index) => ({
      action: process.action, pid: process.pid, exitCode: process.exitCode, value: process.value,
      stdout: archive(`${actual.id}-${index}-stdout.raw`, process.stdout),
      stderr: archive(`${actual.id}-${index}-stderr.raw`, process.stderr),
    }));
    const before = actual.acknowledgedBytesBefore === null ? null
      : archive(`${actual.id}-prior-ack-before.raw`, actual.acknowledgedBytesBefore);
    const after = actual.acknowledgedBytesAfter === null ? null
      : archive(`${actual.id}-prior-ack-after.raw`, actual.acknowledgedBytesAfter);
    const ownedFiles = actual.ownedFiles.map((file, index) => ({
      relative: file.relative, archived: archive(`${actual.id}-owned-${index}.raw`, file.bytes),
    }));
    const { acknowledgedBytesBefore, acknowledgedBytesAfter, ...metadata } = actual;
    records.push({ ...metadata, processes, ownedFiles, before, after });
    process.stdout.write(JSON.stringify({ id: actual.id, code: actual.apiFailure.error.code,
      processes: processes.length, previousAcknowledgmentPreserved: actual.acknowledgmentBytesPreserved,
      cleaned: actual.cleaned, passed: actual.passed }) + '\n');
  }
  const bank = {
    schemaVersion: 1, cardId: 'C019', mode: 'bundled-historical-C015-errors',
    capturedAtUtc, captureId: path.basename(directory),
    filesystemInspectionNow: false, recoveryConfirmed: false,
    cases: records.map((record) => ({ id: record.id, label: record.label, failure: record.apiFailure })),
  };
  const script = "(function(root){'use strict';function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}const bank=freeze(" +
    JSON.stringify(bank) + ");if(typeof module==='object'&&module.exports)module.exports=bank;else Object.defineProperty(root,'C019CapturedObservations',{value:bank});}(globalThis));\r\n";
  save('observations.raw.js', Buffer.from(script));
  save('fixture-records.raw.json', Buffer.from(JSON.stringify({
    schemaVersion: 1, cardId: 'C019', capturedAtUtc, bankSha256: sha(Buffer.from(canonical(bank))),
    totalCases: records.length, freshProcesses: records.reduce((sum, record) => sum + record.processes.length, 0),
    priorAcknowledgmentsRetained: records.filter((record) => record.acknowledgmentBytesPreserved === true).length,
    namespacesCleaned: records.filter((record) => record.cleaned).length,
    records, recoveryConfirmed: false, nativeAzureExecution: false, originalUnitCredits: 0,
  }, null, 2) + '\r\n'));
  process.stdout.write(JSON.stringify({ bankSha256: sha(Buffer.from(canonical(bank))),
    observations: path.relative(path.resolve(__dirname, '..'), path.join(directory, 'observations.raw.js')),
    actualCases: records.length, cleaned: records.length, passed: true }) + '\n');
})().catch((error) => {
  process.stderr.write(JSON.stringify({ code: 'C019_FIXTURE_CAPTURE_FAILED', name: error.name,
    message: error.message, stack: error.stack }) + '\n');
  process.exitCode = 1;
});
