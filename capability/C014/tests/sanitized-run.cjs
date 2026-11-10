'use strict';

// Test tooling, not production code. Runs `node <arguments>` from the repository root and prints its output with every local absolute path replaced by a placeholder
// (<REPO> for the repository, <HOME> for the folder of a user): the runner prints the absolute location of a FAILING test, and a recorded transcript cannot be edited
// afterwards without breaking its hash (rule 15: no local identifier in committed evidence). The exit code is the child's.
// Usage (repository root): node capability\C014\tests\sanitized-run.cjs -- --require .\capability\C014\tests\scratch-cwd.cjs --test <test files>
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const REPOSITORY = path.resolve(__dirname, '..', '..', '..');
const separator = process.argv.indexOf('--');
const args = process.argv.slice(separator < 0 ? 2 : separator + 1);
if (args.length === 0) throw new Error('usage: node sanitized-run.cjs -- <arguments for node>');
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
delete env.NODE_V8_COVERAGE;
const run = spawnSync(process.execPath, args, { cwd: REPOSITORY, env, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
if (process.env.C014_PRIVATE_EVIDENCE && process.env.C014_ACTIVE_CAPTURE) {
  const directory = path.join(process.env.C014_PRIVATE_EVIDENCE, 'underlying', process.env.C014_ACTIVE_CAPTURE);
  fs.mkdirSync(directory, { recursive: true });
  const streams = {};
  for (const name of ['stdout', 'stderr']) {
    const bytes = run[name] || Buffer.alloc(0);
    const gzip = zlib.gzipSync(bytes);
    const file = `${name}.original.raw.gz`;
    fs.writeFileSync(path.join(directory, file), gzip, { flag: 'wx' });
    streams[name] = { path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      gzipSha256: createHash('sha256').update(gzip).digest('hex') };
  }
  fs.writeFileSync(path.join(directory, 'original.json'), JSON.stringify({ schema: 'C014-original-command-streams/1',
    role: 'Exact unmodified inner command streams; the shared recorder separately captures a path-projected wrapper stream.',
    args, exit: run.status, signal: run.signal, streams }, null, 2) + '\n', { flag: 'wx' });
}
const forward = REPOSITORY.replace(/\\/g, '/');
const escaped = REPOSITORY.replace(/\\/g, '\\\\');
const clean = (bytes) => bytes.toString('utf8').split(escaped).join('<REPO>').split(REPOSITORY).join('<REPO>').split(forward).join('<REPO>').replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s'"]+/g, '<HOME>');
process.stdout.write(clean(run.stdout || Buffer.alloc(0)));
process.stderr.write(clean(run.stderr || Buffer.alloc(0)));
process.exitCode = run.status === null ? 1 : run.status;
