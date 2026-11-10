'use strict';

// Test tooling: emit portable paths before the shared recorder captures this command's raw streams.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { childEnv } = require('./u039-lib.cjs');

const repository = path.resolve(__dirname, '..', '..', '..');
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, args, { cwd: repository, env: childEnv(), maxBuffer: 256 * 1024 * 1024, timeout: 1800000, windowsHide: true });
const portable = (bytes) => [repository.replaceAll('\\', '\\\\'), repository, repository.split(path.sep).join('/')].reduce((text, prefix) => text.split(prefix).join('<repository>'), String(bytes ?? ''));
if (process.env.U056_PRIVATE_RAW) {
  fs.mkdirSync(process.env.U056_PRIVATE_RAW, { recursive: true });
  for (const name of ['stdout', 'stderr']) fs.writeFileSync(path.join(process.env.U056_PRIVATE_RAW, `${name}.raw`), result[name] ?? Buffer.alloc(0), { flag: 'wx' });
}
process.stdout.write(portable(result.stdout));
process.stderr.write(portable(result.stderr));
if (result.error) {
  process.stderr.write(`\ncommand error: ${result.error.code}\n`);
  process.exitCode = 3;
} else process.exitCode = result.status ?? 3;
