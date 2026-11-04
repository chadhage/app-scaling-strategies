'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
function hashes(directory = __dirname, prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) throw new Error('No owned source/evidence symlink traversal.');
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, hashes(path.join(directory, entry.name), relative));
    else result[relative] = createHash('sha256').update(fs.readFileSync(path.join(directory, entry.name))).digest('hex');
  }
  return result;
}
const before = hashes();
const files = ['model.test.cjs', 'integrity.test.cjs', 'browser.test.cjs'].map((name) => path.join(__dirname, name));
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const after = hashes();
const changed = Object.keys(before).filter((file) => after[file] !== before[file]);
const added = Object.keys(after).filter((file) => !Object.hasOwn(before, file));
const allowedAdds = capture && added.every((file) => /^evidence\\raw\\browser-[\w.-]+\.json$/.test(file));
const preserved = changed.length === 0 && (added.length === 0 || allowedAdds);
const stdout = result.stdout || '';
const stderr = result.stderr || '';
const metric = (name) => Number(stdout.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] ?? -1);
const report = {
  schemaVersion: 1, cardId: 'A-S128', verifiedAtUtc: new Date().toISOString(),
  command: 'node --test learning\\S128\\model.test.cjs learning\\S128\\integrity.test.cjs learning\\S128\\browser.test.cjs',
  exitCode: result.status, tests: metric('tests'), passed: metric('pass'), failed: metric('fail'), skipped: metric('skipped'),
  outcome: result.status === 0 && preserved ? 'passed' : 'failed',
  normalVerificationReadOnly: !capture && preserved, deliberateCapture: capture,
  existingOwnedFilesPreserved: preserved, ownedFilesChecked: Object.keys(before).length,
  changedFiles: changed, addedFiles: added, sourceHashesBefore: before,
  nativeProofComplete: false, sourceParentComplete: false, productionNode24Validated: false,
  iac: 'N/A', originalKanoUnit: 'A-S128', frozenKano: 'S', extraCredits: 0,
};
if (capture) {
  const identity = `${report.verifiedAtUtc.replace(/[:.]/g, '-')}-${randomUUID()}`;
  const transcript = path.join('evidence', 'raw', `focused-${identity}.stdout.tap`);
  const summary = path.join('evidence', 'raw', `verification-${identity}.json`);
  report.rawTranscript = transcript;
  fs.writeFileSync(path.join(__dirname, transcript), stdout + stderr, { flag: 'wx' });
  fs.writeFileSync(path.join(__dirname, summary), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`S128_VERIFICATION_CAPTURE=${path.join('learning', 'S128', summary)}`);
}
console.log(JSON.stringify({
  outcome: report.outcome, exitCode: report.exitCode, tests: report.tests, passed: report.passed,
  failed: report.failed, skipped: report.skipped, existingOwnedFilesPreserved: preserved,
  normalVerificationReadOnly: report.normalVerificationReadOnly, ownedFilesChecked: report.ownedFilesChecked,
  addedFiles: report.addedFiles,
}));
if (report.outcome !== 'passed') console.error(stdout + stderr);
process.exitCode = report.outcome === 'passed' ? 0 : 1;
