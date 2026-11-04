'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const source = require('..\\source.cjs');
if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1' || process.argv.length !== 2) throw new Error('Exact deliberate one-original publication capture only.');
const id = randomUUID();
const directory = path.join(__dirname, '..', 'evidence', `publication-${id}`);
fs.mkdirSync(directory);
const startedAtUtc = new Date().toISOString();
const run = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
  '-File', path.join(__dirname, '..', 'publish.ps1')], {
  cwd: source.repository, env: { ...process.env }, encoding: null,
  timeout: 360000, maxBuffer: 32 * 1024 * 1024, windowsHide: true
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
for (const [stream, bytes] of [['stdout', stdout], ['stderr', stderr]]) {
  fs.writeFileSync(path.join(directory, `${stream}.raw.gz`), gzipSync(bytes), { flag: 'wx' });
}
const marker = 'C035_PUBLICATION_RESULT_JSON=';
const lines = stdout.toString('utf8').split(/\r?\n/).filter((line) => line.startsWith(marker));
let publication;
if (run.status === 0 && lines.length === 1) {
  try { publication = JSON.parse(lines[0].slice(marker.length)); } catch {}
}
const report = {
  ...(publication || {
    cardId: 'C035', workerId: 'worker-C035', outcome: 'incomplete',
    blocker: 'Bounded local classifier evidence retained, but exact guarded standard publication did not complete all proof. No reset/amend/force, ahead carry, unowned cleanup, fake cancellation or Done.'
  }),
  publicationCapture: {
    startedAtUtc, completedAtUtc: new Date().toISOString(), exitCode: run.status, signal: run.signal,
    error: run.error?.message || null, rawDirectory: path.relative(source.repository, directory),
    stdoutRawSha256: source.hash(stdout), stdoutCrlfToLfSha256: source.hash(source.lf(stdout)),
    stdoutCrlfPairs: (stdout.toString('utf8').match(/\r\n/g) || []).length,
    stderrRawSha256: source.hash(stderr), stderrCrlfToLfSha256: source.hash(source.lf(stderr)),
    exactCapture: 'CAPTURE_BROWSER_EVIDENCE=1', rawBytesPreserved: true
  }
};
const file = path.join(__dirname, '..', `publication-result-${id}.json`);
fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  cardId: 'C035', outcome: report.outcome, commit: report.commit || null, tag: report.tag || null,
  resultPath: path.relative(source.repository, file), rawDirectory: report.publicationCapture.rawDirectory,
  exitCode: run.status, proofCounts: report.proof?.proofCounts || null
}));
if (report.outcome !== 'published') {
  process.stdout.write(stdout); process.stderr.write(stderr); process.exitCode = 1;
}
