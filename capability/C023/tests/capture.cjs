'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const [stage, expectedText, ...args] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]{0,49}$/.test(stage || '') || !/^[01]$/.test(expectedText || '') || !args.length) {
  throw new Error('Usage: node tests\\capture.cjs stage expectedExit nodeArguments...');
}
const destination = path.join(root, 'evidence', stage);
const paths = ['.json', '.stdout.txt', '.stderr.txt'].map((suffix) => destination + suffix);
if (paths.some((file) => fs.existsSync(file))) throw new Error('Historical capture exists; use a distinct stage, never overwrite proof.');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function sources(directory, result = {}) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) sources(file, result);
    else if (/\.(js|cjs|html|css|feature)$/.test(entry.name)) {
      result[path.relative(repo, file)] = sha256(fs.readFileSync(file));
    }
  }
  return result;
}
const startedAtUtc = new Date().toISOString();
const sourceHashes = sources(root);
const dependencySourceHashes = Object.fromEntries(['contract.js', 'profiles.cjs'].map((name) => {
  const file = path.join(root, '..', 'C020', name);
  return [path.relative(repo, file), sha256(fs.readFileSync(file))];
}));
const sourceSnapshots = stage === 'refinement-red'
  ? Object.fromEntries(['page.js', 'tests\\browser.cjs'].map((file) => [
    path.join('capability', 'C023', file), fs.readFileSync(path.join(root, file), 'utf8')
  ])) : undefined;
const result = spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
const stdout = result.stdout || '';
const stderr = result.stderr || '';
fs.writeFileSync(paths[1], stdout, { flag: 'wx' });
fs.writeFileSync(paths[2], stderr, { flag: 'wx' });
const record = {
  schemaVersion: 1, cardId: 'C023', stage, startedAtUtc, finishedAtUtc: new Date().toISOString(),
  command: [process.execPath, ...args], workingDirectory: repo, runtime: process.version,
  browserEvidenceCaptureRequested: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
  exitCode: result.status, expectedExitCode: Number(expectedText),
  matchedExpectedExit: result.status === Number(expectedText),
  processError: result.error ? { code: result.error.code, message: result.error.message } : null,
  stdoutSha256: sha256(stdout), stderrSha256: sha256(stderr),
  rawStdout: path.relative(repo, paths[1]), rawStderr: path.relative(repo, paths[2]),
  sourceHashes, dependencySourceHashes, sourceSnapshots,
  testSummary: Object.fromEntries([...stdout.matchAll(/^# (tests|pass|fail|cancelled|skipped) (\d+)$/gm)].map((match) => [match[1], Number(match[2])]))
};
fs.writeFileSync(paths[0], JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
console.log(stdout);
if (stderr) console.error(stderr);
console.log(JSON.stringify({ stage, exitCode: result.status, matchedExpectedExit: record.matchedExpectedExit }));
if (!record.matchedExpectedExit) process.exitCode = 1;
