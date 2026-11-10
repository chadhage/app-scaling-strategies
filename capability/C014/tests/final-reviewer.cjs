'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const REPOSITORY = path.resolve(__dirname, '..', '..', '..');
const mode = process.argv[2];
assert.ok(['repro', 'flood'].includes(mode));
assert.ok(process.env.C014_REVIEW_DIR && process.env.C014_PRIVATE_EVIDENCE);
const name = mode === 'repro' ? 'C014.fix.repro.cjs' : 'C014.fix.floodloop.cjs';
const file = path.join(process.env.C014_REVIEW_DIR, name);
const bytes = fs.readFileSync(file);
const env = { ...process.env, NODE_V8_COVERAGE: '' };
delete env.NODE_TEST_CONTEXT;
const args = mode === 'repro' ? ['capability\\C014'] : ['72', '3', 'C014-final'];
const run = spawnSync(process.execPath, [file, ...args], { cwd: REPOSITORY, env, encoding: 'utf8', windowsHide: true, timeout: 1800000, maxBuffer: 64 * 1024 * 1024 });
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
assert.equal(run.error, undefined, 'actual unchanged reviewer command completed');
assert.equal(run.status, 0, 'actual reviewer command exited naturally');
if (mode === 'repro') {
  assert.match(run.stdout, /^A1 .* -> "\[redacted\]"/m);
  assert.match(run.stdout, /^A2 .*details \["\[redacted\]"\]/m, 'the historical parenthetical in this unchanged script is not an observation');
  assert.match(run.stdout, /^B .*anonymous trace: false .*standard form .*: false; the percent form: false/m);
  assert.doesNotMatch(run.stdout, /NOT MASKED/);
  assert.equal((run.stdout.match(/^D  .*: masked$/gm) || []).length, 8);
  assert.match(run.stdout, /7-digit hex entity form: false, the 7-digit braced escape form: false/);
} else assert.match(run.stdout, /runs 72, pass 72, fail 0, timeout 0/);
const report = { schema: 'C014-unchanged-reviewer-replay/1', script: name,
  sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'), exit: run.status, validatedObservations: true,
  stdoutSha256: crypto.createHash('sha256').update(run.stdout || '').digest('hex'),
  stderrSha256: crypto.createHash('sha256').update(run.stderr || '').digest('hex') };
fs.writeFileSync(path.join(process.env.C014_PRIVATE_EVIDENCE, `reviewer-${mode}-final.json`), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));
