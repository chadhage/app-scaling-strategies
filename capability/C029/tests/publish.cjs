'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { parsePublishedOutput } = require('..\\publication-result.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1' || process.argv.length !== 2) {
  throw new Error('One deliberate exact publication capture only; no paths, identities or publisher overrides.');
}
const id = randomUUID();
const directory = path.join(root, 'evidence', `publication-final-${id}`);
fs.mkdirSync(directory);
const startedAtUtc = new Date().toISOString();
const run = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(root, 'publish.ps1')], {
  cwd: repository, env: { ...process.env }, encoding: null, timeout: 300000,
  maxBuffer: 16 * 1024 * 1024, windowsHide: true
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(path.join(directory, 'stdout.raw.gz'), gzipSync(stdout), { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'stderr.raw.gz'), gzipSync(stderr), { flag: 'wx' });
let publication;
if (run.status === 0) {
  try { publication = parsePublishedOutput(stdout.toString('utf8')); } catch {}
}
const report = {
  ...(publication || {
    cardId: 'C029', workerId: 'worker-C029', outcome: 'incomplete',
    blocker: 'Bounded local evaluator verified, but exact guarded publication failed. Raw failure retained; no reset/amend/force/lock cleanup or fake Done.'
  }),
  publicationCapture: {
    startedAtUtc, completedAtUtc: new Date().toISOString(), exitCode: run.status,
    signal: run.signal, error: run.error?.message || null, stdoutSha256: hash(stdout), stderrSha256: hash(stderr),
    rawDirectory: path.relative(repository, directory), exactCapture: 'CAPTURE_BROWSER_EVIDENCE=1'
  }
};
const reportPath = path.join(root, `publication-result-${id}.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  cardId: 'C029', outcome: report.outcome, commit: report.commit, tag: report.tag,
  resultPath: path.relative(repository, reportPath), exitCode: run.status,
  rawDirectory: path.relative(repository, directory), proofCounts: report.proof?.proofCounts
}));
if (report.outcome !== 'published') {
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = 1;
}
