'use strict';

// Test tooling (not production code): runs `node <arguments>` with the working directory in a SCRATCH directory, never in the repository
// root, so that a RED run against unfixed code cannot leave a stray file there (L-0182). Repository-relative file arguments are made absolute.
//   node tests\u005-scratch-run.cjs <scratch directory> <node arguments...>
// The exit code and both streams of the child are passed through unchanged.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const [scratch, ...args] = process.argv.slice(2);
if (!scratch || args.length === 0) throw new Error('usage: u005-scratch-run.cjs <scratch directory> <node arguments...>');
const cwd = path.resolve(scratch);
if (cwd === repoRoot || cwd.startsWith(repoRoot + path.sep)) throw new Error('the scratch directory must be outside the repository');
fs.mkdirSync(cwd, { recursive: true });
const absolute = args.map((arg) => (!arg.startsWith('-') && fs.existsSync(path.resolve(repoRoot, arg)) ? path.resolve(repoRoot, arg) : arg));
const result = spawnSync(process.execPath, absolute, { cwd, stdio: 'inherit', windowsHide: true });
process.exitCode = result.status === null ? 1 : result.status;
