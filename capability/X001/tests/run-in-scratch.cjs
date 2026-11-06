'use strict';

// Runs `node <arguments>` with a SCRATCH directory as the working directory, never the repository root (L-0182), and removes it afterwards.
//   node capability\X001\tests\run-in-scratch.cjs <scratch-dir-that-does-not-exist> <node arguments...>
// Relative script arguments (*.js, *.cjs) are resolved against the repository root. NODE_TEST_CONTEXT and NODE_V8_COVERAGE are removed from the child.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { childEnvironment } = require('.\\nested-runner.cjs');

const repository = path.resolve(__dirname, '..', '..', '..');
const [target, ...args] = process.argv.slice(2);
if (!target || args.length === 0 || fs.existsSync(path.resolve(target))) throw new Error('usage: node run-in-scratch.cjs <scratch-dir-that-does-not-exist> <node arguments...>');
const scratch = path.resolve(target);
const resolved = args.map((arg) => (/\.c?js$/.test(arg) && !path.isAbsolute(arg) && !arg.startsWith('-') ? path.resolve(repository, arg) : arg));
fs.mkdirSync(scratch, { recursive: true });
try {
  console.log(`# run-in-scratch: cwd=${scratch}`);
  const result = spawnSync(process.execPath, resolved, { cwd: scratch, env: childEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  process.exitCode = result.status === null ? 1 : result.status;
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
