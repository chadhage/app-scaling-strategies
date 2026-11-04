'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
if (process.argv.length !== 2 || process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Exact explicit own publication capture only.');
const run = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
  path.join(__dirname, 'publish-transport.ps1')], {
  cwd: path.resolve(__dirname, '..', '..', '..'), env: { ...process.env },
  encoding: null, windowsHide: true, timeout: 210000, maxBuffer: 8388608
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.error) console.error(run.error);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
