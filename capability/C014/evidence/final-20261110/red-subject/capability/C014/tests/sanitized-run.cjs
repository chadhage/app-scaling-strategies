'use strict';

// Test tooling, not production code. Runs `node <arguments>` from the repository root and prints its output with every local absolute path replaced by a placeholder
// (<REPO> for the repository, <HOME> for the folder of a user): the runner prints the absolute location of a FAILING test, and a recorded transcript cannot be edited
// afterwards without breaking its hash (rule 15: no local identifier in committed evidence). The exit code is the child's.
// Usage (repository root): node capability\C014\tests\sanitized-run.cjs -- --require .\capability\C014\tests\scratch-cwd.cjs --test <test files>
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPOSITORY = path.resolve(__dirname, '..', '..', '..');
const separator = process.argv.indexOf('--');
const args = process.argv.slice(separator < 0 ? 2 : separator + 1);
if (args.length === 0) throw new Error('usage: node sanitized-run.cjs -- <arguments for node>');
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
delete env.NODE_V8_COVERAGE;
const run = spawnSync(process.execPath, args, { cwd: REPOSITORY, env, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
const forward = REPOSITORY.replace(/\\/g, '/');
const clean = (bytes) => bytes.toString('utf8').split(REPOSITORY).join('<REPO>').split(forward).join('<REPO>').replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s'"]+/g, '<HOME>');
process.stdout.write(clean(run.stdout || Buffer.alloc(0)));
process.stderr.write(clean(run.stderr || Buffer.alloc(0)));
process.exitCode = run.status === null ? 1 : run.status;
