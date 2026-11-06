'use strict';
// RED replay against a naive subject (tooling, not production code): node testing\quality\replay-red.cjs --scratch <empty folder outside the repository>
// Copies testing\quality (without evidence) to the scratch folder, replaces the two entry points of the validator by the naive stubs of
// evidence\r3\final-red\stubs (an accept-everything validator and a CLI that always exits 0), runs the FINAL tests there and relays their output and exit code.
// The helper modules (limits, text, dates, ident, meters, shell, rules-*) stay real: their own RED is evidence\r3\red-01. Expected: exit 1, many failures.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = __dirname;
const args = process.argv.slice(2);
const scratch = args[args.indexOf('--scratch') + 1];
if (args.indexOf('--scratch') < 0 || !scratch) { console.error('usage: node testing\\quality\\replay-red.cjs --scratch <empty folder outside the repository>'); process.exit(2); }

fs.rmSync(scratch, { recursive: true, force: true });
fs.cpSync(ROOT, scratch, { recursive: true, filter: (src) => !src.includes(`${path.sep}evidence`) });
const stubs = path.join(ROOT, 'evidence', 'r3', 'final-red', 'stubs');
fs.copyFileSync(path.join(stubs, 'packet-validator.stub.cjs'), path.join(scratch, 'packet-validator.cjs'));
fs.copyFileSync(path.join(stubs, 'validate-packet.stub.cjs'), path.join(scratch, 'validate-packet.cjs'));

const tests = fs.readdirSync(path.join(scratch, 'tests')).filter((f) => f.endsWith('.test.cjs') && f !== 'evidence.test.cjs').sort().map((f) => path.join(scratch, 'tests', f));
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
delete env.NODE_V8_COVERAGE;
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], { cwd: scratch, env, encoding: 'utf8', timeout: 900000, maxBuffer: 1 << 28 });
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
fs.rmSync(scratch, { recursive: true, force: true });
process.exitCode = r.status === null ? 2 : r.status;
