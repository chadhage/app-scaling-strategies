'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const [mode, ...extra] = process.argv.slice(2);
assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Capture requires exact deliberate opt-in.');
assert.equal(extra.length, 0);
assert.ok(['red', 'guards', 'focused', 'syntax', 'browser', 'fixtures', 'prerequisites', 'publication', 'boundary', 'authorization', 'metadata'].includes(mode));
const evidence = path.join(root, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
const capture = path.join(evidence, `${mode}-${randomUUID()}`);
let created = false;
function ensureCapture() {
  if (!created) {
    fs.mkdirSync(capture);
    created = true;
  }
}
if (mode === 'fixtures') ensureCapture();
const files = [];
function save(name, bytes) {
  ensureCapture();
  fs.writeFileSync(path.join(capture, name), bytes, { flag: 'wx' });
  files.push({ name, bytes: bytes.length, sha256: sha(bytes) });
}
function archive(name, bytes) {
  save(`${name}.gz`, gzipSync(bytes));
  return { file: `${name}.gz`, originalBytes: bytes.length, originalSha256: sha(bytes),
    crlf: (bytes.toString('utf8').match(/\r\n/g) || []).length };
}
let result;
let snapshots = [];
let baseline = null;
if (mode === 'prerequisites') {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.ifError(head.error);
  assert.equal(head.status, 0);
  baseline = head.stdout.trim();
  const source = [
    'README.md', '.docs\\wiki\\kanban.md', '.docs\\wiki\\backlog.md',
    'capability\\C001\\README.md', 'capability\\C001\\approved-contract.js',
    'capability\\C001\\contract-guard.js', 'capability\\C002\\README.md',
    'capability\\C002\\run-envelope-contract.js', 'capability\\C002\\validator.js',
    'capability\\C002\\validator.d.ts', 'capability\\C002\\json-input.js',
    'capability\\C002\\synthetic-fixture.js', 'capability\\C015\\README.md',
    'capability\\C015\\store.cjs', 'capability\\C015\\store.d.ts',
    'capability\\C015\\contract.cjs', 'capability\\C015\\consent.cjs',
    'capability\\C015\\consent-current.ps1', 'capability\\C015\\paths.cjs',
    'testing\\browser\\isolated.cjs',
  ];
  for (const [index, relative] of source.entries()) {
    let bytes;
    if (relative === '.docs\\wiki\\kanban.md') {
      const locked = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
        "$m=[Threading.Mutex]::new($false,'Local\\AppScalingStrategies_KanbanState_v1');$h=$false;try{$h=$m.WaitOne([TimeSpan]::FromSeconds(30));if(-not $h){throw 'State mutex timeout'};[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path (Get-Location) '.docs\\wiki\\kanban.md')))}finally{if($h){$m.ReleaseMutex()};$m.Dispose()}"],
      { encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024, windowsHide: true });
      assert.ifError(locked.error);
      assert.equal(locked.status, 0);
      bytes = Buffer.from(locked.stdout.trim(), 'base64');
    } else bytes = fs.readFileSync(path.resolve(relative));
    const canonical = spawnSync('git', ['--no-pager', 'show', `${baseline}:${relative.replaceAll('\\', '/')}`],
      { timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
    assert.ifError(canonical.error);
    assert.equal(canonical.status, 0);
    snapshots.push({ path: relative, working: archive(`${index}-working.raw`, bytes),
      canonical: archive(`${index}-git.raw`, canonical.stdout) });
  }
  const publisher = fs.readFileSync(path.resolve('.git\\kanban-orchestrator\\publish.ps1'));
  const current = require('./authorization.cjs').readCurrent();
  assert.equal(sha(publisher), current.central.approvedRevision.publisherSha256);
  save('controller-authorization.raw.json', Buffer.from(JSON.stringify(current, null, 2) + '\r\n'));
  snapshots.push({ path: '.git\\kanban-orchestrator\\publish.ps1', working: archive('publisher.raw', publisher) });
  result = { status: 0, stdout: Buffer.from('Exact prerequisites and approved publisher recorded.\r\n'), stderr: Buffer.alloc(0) };
} else {
  const entry = mode === 'red' ? path.join(__dirname, 'red.test.cjs')
    : mode === 'fixtures' ? path.join(__dirname, 'capture-fixtures.cjs')
      : mode === 'boundary' ? path.join(__dirname, 'boundary.cjs')
        : mode === 'authorization' ? path.join(__dirname, 'capture-authorization.cjs')
      : path.join(__dirname, 'verify.cjs');
  const args = mode === 'red' ? ['--test', entry] : ['fixtures', 'boundary', 'authorization'].includes(mode) ? [entry]
    : [entry, mode === 'metadata' ? 'authorization' : mode];
  result = spawnSync(process.execPath, args, {
    timeout: 600000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    env: { ...process.env, C019_CAPTURE_DIRECTORY: mode === 'fixtures' || mode === 'browser' ? capture : '' },
  });
  assert.ifError(result.error);
  if (mode === 'red') {
    for (const relative of ['recovery.js', 'tests\\red.test.cjs', 'C019.feature']) {
      snapshots.push({ path: relative, working: archive(relative.replaceAll('\\', '-') + '.raw', fs.readFileSync(path.join(root, relative))) });
    }
  } else if (mode === 'publication') {
    snapshots.push({ path: '.git\\kanban-orchestrator\\publish.ps1',
      working: archive('publisher-observed.raw', fs.readFileSync(path.resolve('.git\\kanban-orchestrator\\publish.ps1'))) });
  } else if (mode === 'authorization') {
    snapshots.push({ path: 'publication.json',
      working: archive('prior-blocked-report.raw', fs.readFileSync(path.join(root, 'publication.json'))) });
    snapshots.push({ path: '.git\\kanban-orchestrator\\publish.ps1',
      working: archive('current-approved-publisher.raw', fs.readFileSync(path.resolve('.git\\kanban-orchestrator\\publish.ps1'))) });
  }
}
const stdout = archive('stdout.raw', result.stdout || Buffer.alloc(0));
const stderr = archive('stderr.raw', result.stderr || Buffer.alloc(0));
let browserRecord = null;
if (mode === 'browser') {
  const match = /(?:^|\n)(?:# )?C019_BROWSER_RECORD=([^\r\n]+)/.exec(result.stdout.toString());
  if (match) {
    browserRecord = JSON.parse(match[1]);
    save('browser.raw.json', Buffer.from(JSON.stringify(browserRecord, null, 2) + '\r\n'));
  }
}
const verifyMatch = /(?:^|\n)(?:# )?C019_VERIFY_RECORD=([^\r\n]+)/.exec(result.stdout.toString());
const verifierRecord = verifyMatch ? JSON.parse(verifyMatch[1]) : null;
const boundaryMatch = /(?:^|\n)(?:# )?C019_BOUNDARY_RECORD=([^\r\n]+)/.exec(result.stdout.toString());
const boundaryRecord = boundaryMatch ? JSON.parse(boundaryMatch[1]) : null;
if (boundaryRecord) save('boundary.raw.json', Buffer.from(JSON.stringify(boundaryRecord, null, 2) + '\r\n'));
const authorizationMatch = /(?:^|\n)(?:# )?C019_AUTHORIZATION_RECORD=([^\r\n]+)/.exec(result.stdout.toString());
const authorizationRecord = authorizationMatch ? JSON.parse(authorizationMatch[1]) : null;
if (authorizationRecord) save('authorization.raw.json', Buffer.from(JSON.stringify(authorizationRecord, null, 2) + '\r\n'));
const ordinaryPassed = result.status === 0 &&
  (!['metadata', 'guards', 'focused', 'browser', 'syntax', 'publication'].includes(mode) || (verifierRecord !== null && verifierRecord.exitCode === 0)) &&
  (mode !== 'browser' || (browserRecord !== null && browserRecord.passed === true && browserRecord.closed === true)) &&
  (mode !== 'boundary' || boundaryRecord !== null) &&
  (mode !== 'authorization' || authorizationRecord !== null);
const record = {
  schemaVersion: 1, cardId: 'C019', workerId: 'worker-C019', mode,
  capturedAtUtc: new Date().toISOString(), node: process.version,
  baseline,
  deliberateCapture: true, exitCode: result.status, signal: result.signal || null,
  stdout, stderr, snapshots, files,
  browserRecord,
  verifierRecord,
  boundaryRecord,
  authorizationRecord: authorizationRecord === null ? null : {
    actualPublisherSha256: authorizationRecord.actualPublisherSha256,
    sourceSelector: authorizationRecord.authorization.sourceSelector,
    runtimeFilesPreserved: Object.keys(authorizationRecord.preservation.runtime).length,
    historicalEvidenceFilesPreserved: Object.keys(authorizationRecord.preservation.historicalEvidence).length,
    dependencyFilesPreserved: Object.keys(authorizationRecord.preservation.dependencies).length,
  },
  genuineAssertionRed: mode === 'red' && result.status === 1 && /ERR_ASSERTION/.test(result.stdout.toString()),
  passed: mode === 'red' ? result.status === 1 && /ERR_ASSERTION/.test(result.stdout.toString()) : ordinaryPassed,
  originalUnitCredits: 0,
};
save('capture.raw.json', Buffer.from(JSON.stringify(record, null, 2) + '\r\n'));
process.stdout.write(result.stdout || Buffer.alloc(0));
process.stderr.write(result.stderr || Buffer.alloc(0));
process.stdout.write(JSON.stringify({ capture: path.relative(root, capture), mode, exitCode: result.status, passed: record.passed }) + '\n');
process.exitCode = record.passed ? 0 : 1;
