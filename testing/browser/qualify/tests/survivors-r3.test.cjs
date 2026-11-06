'use strict';

// Survivors of the pilot mutation run of the second fix (each test names the mutant it kills): the checks that are redundant on
// the normal path but are the last line of defense when the file changes between two reads, and a report with other suites.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const addendum = require('../addendum.cjs');
const { SHA } = require('./support.cjs');
const { scratchDir, removeDir } = require('./harness.cjs');
const { chain, anchorOf, SEALED_CRLF } = require('./chain.cjs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OPTIONS = { anchor: anchorOf(SEALED_CRLF), sealedMajors: [156] };
const suite = (file, tests, version) => ({
  file, tests, pass: tests, fail: 0, cancelled: 0, skipped: 0, todo: 0, testsPassed: true, passed: true, timedOut: false, browserVersionsSeen: [version],
});
const reportFor = (major, suites = ['isolated.test.cjs', 'loopback.test.cjs']) => {
  const version = `${major}.0.4341.42`;
  return {
    schemaVersion: 1, ok: false, reasonCodes: ['MAJOR_NOT_QUALIFIED'], path: EDGE, version, major,
    signature: { status: 'Valid', publisher: 'Microsoft Corporation' }, sha256: SHA,
    requalification: {
      ran: true, passed: true, candidateMajor: major, suites: suites.map((file) => suite(file, 5, version)),
      edgeAfter: { path: EDGE, version, sha256: SHA, ok: false }, edgeChangedDuringRun: false,
    },
  };
};
const verifyFor = (major) => async () => ({ ok: true, version: `${major}.0.4341.42`, major, sha256: SHA, signature: { status: 'Valid', publisher: 'Microsoft Corporation' } });

function workspace(t, { addendumText = null, reportObject }) {
  const dir = scratchDir();
  t.after(() => removeDir(dir));
  const files = { qualifiedFile: path.join(dir, 'qualified.json'), addendumFile: path.join(dir, 'qualified.addendum.jsonl'), reportPath: path.join(dir, 'report.json') };
  fs.writeFileSync(files.qualifiedFile, SEALED_CRLF);
  if (addendumText !== null) fs.writeFileSync(files.addendumFile, addendumText);
  fs.writeFileSync(files.reportPath, JSON.stringify(reportObject));
  return files;
}

test('N1-a17: parseAddendum itself refuses more than 65536 bytes, also when the file grew after its size was read', () => {
  const direct = addendum.parseAddendum(Buffer.alloc(65537, 0x78), OPTIONS);
  assert.deepEqual([direct.ok, direct.error], [false, 'the file is larger than 65536 bytes']);
  const regular = { isFile: () => true, isSymbolicLink: () => false, size: 10 };
  const grown = addendum.readAddendum('x', { ...OPTIONS, fsApi: { lstatSync: () => regular, readFileSync: () => Buffer.alloc(65537, 0x78) } });
  assert.deepEqual([grown.ok, grown.error], [false, 'the file is larger than 65536 bytes']);
});

test('N1-b11: a report that lists other suites than isolated.test.cjs and loopback.test.cjs is refused', async (t) => {
  for (const suites of [['isolated.test.cjs'], ['loopback.test.cjs', 'isolated.test.cjs'], ['isolated.test.cjs', 'loopback.test.cjs', 'extra.test.cjs'], ['other.test.cjs', 'loopback.test.cjs']]) {
    const files = workspace(t, { reportObject: reportFor(157, suites) });
    const result = await addendum.appendFromReport({ ...files, verify: verifyFor(157) });
    assert.equal(result.ok, false, suites.join(','));
    assert.match(result.error, /the report does not list exactly the suites isolated\.test\.cjs and loopback\.test\.cjs/, suites.join(','));
    assert.equal(fs.existsSync(files.addendumFile), false);
  }
});

test('N1-c05: the 201st line is refused after the report and the Edge were accepted, and the file stays as it was', async (t) => {
  const full = chain(SEALED_CRLF, Array.from({ length: 200 }, (_, i) => 157 + i)).text;
  const files = workspace(t, { addendumText: full, reportObject: reportFor(357) });
  const result = await addendum.appendFromReport({ ...files, verify: verifyFor(357) });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'the new line cannot be added: the file has more than 200 lines');
  assert.equal(fs.readFileSync(files.addendumFile, 'utf8'), full);
  assert.equal(fs.existsSync(`${files.addendumFile}.lock`), false, 'the lock is released after a refusal');
});

test('N1-b09: a major that is already listed is refused as listed, before the installed Edge is asked', async (t) => {
  const files = workspace(t, { addendumText: chain(SEALED_CRLF, [157]).text, reportObject: reportFor(157) });
  let asked = 0;
  const result = await addendum.appendFromReport({ ...files, verify: async () => { asked += 1; return {}; } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'major 157 is already listed');
  assert.equal(asked, 0);
});
