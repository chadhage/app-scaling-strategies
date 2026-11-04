'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
if (require.main === module) {
  const action = process.argv[2] || 'Publish';
  if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1' || !['Inspect', 'Publish'].includes(action)) {
    throw new Error('Only exact deliberate capture and the one original X003 publication action are allowed.');
  }
  const result = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'publish.ps1'), '-Action', action], {
    cwd: path.resolve(__dirname, '..', '..', '..'), env: process.env,
    encoding: 'buffer', maxBuffer: 32 * 1024 * 1024
  });
  process.stdout.write(result.stdout || Buffer.alloc(0));
  process.stderr.write(result.stderr || Buffer.alloc(0));
  if (result.error) console.error(result.error);
  process.exitCode = result.status === null ? 1 : result.status;
}
