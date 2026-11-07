'use strict';

// RED snapshot of the third fix, finding F3 of the independent review of c7ec58a79f0d (immutable once archived; it replays unchanged against the fixed files).
// Two regex-quantifier guard mutants of redact.cjs survived EVERY in-process suite: the e-mail shape with its local-part cap 64 replaced by 2, and the long-hex shape with
// 32-or-more digits replaced by 320-or-more. This driver applies each mutant to the file with tests\mutate-preload.cjs, runs every in-process suite of tests\ once per mutant
// and prints SURVIVED (no test failed) or KILLED by the name of the first failing test. Exit 1 when a mutant survives (the RED), 0 when each one is killed (the replay).
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const TESTS = path.join(ROOT, 'tests');
const MUTANTS = [
  ['e-mail shape: local part cap 64 -> 2', 'redact.cjs', '[A-Za-z0-9._%+-]{1,64}@', '[A-Za-z0-9._%+-]{1,2}@'],
  ['long-hex shape: 32 or more digits -> 320 or more', 'redact.cjs', '[0-9a-fA-F]{32,}', '[0-9a-fA-F]{320,}']
];
const SUITES = fs.readdirSync(TESTS).filter((name) => name.endsWith('.test.cjs') && !/^(?:integrity|cleanup|pending-flood|process-.*)\.test\.cjs$/.test(name)).sort().map((name) => path.join(TESTS, name));
const clean = (text) => text.split(ROOT).join('<REPO>').replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s]+/g, '<HOME>').trim().slice(0, 100);

function run([label, file, original, replacement]) {
  return new Promise((resolve) => {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const start = source.indexOf(original);
    if (start < 0 || source.indexOf(original, start + 1) >= 0) { resolve({ label, error: 'the find string is not unique in the pristine source' }); return; }
    const env = { ...process.env, C014_MUTANT: JSON.stringify({ file, start, end: start + original.length, original, replacement }) };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_V8_COVERAGE;
    const scratch = path.join(TESTS, 'scratch');
    fs.mkdirSync(scratch, { recursive: true });
    const child = spawn(process.execPath, ['--require', path.join(TESTS, 'mutate-preload.cjs'), '--test', '--experimental-test-isolation=none', '--test-timeout=90000', ...SUITES], { cwd: scratch, env, windowsHide: true });
    let out = '';
    let killedBy = null;
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const failing = /^not ok \d+ - (.+)$/m.exec(out);
      if (failing && !killedBy) { killedBy = clean(failing[1]); child.kill(); }
    });
    child.on('close', () => resolve({ label, killedBy, tests: Number((/^# tests (\d+)$/m.exec(out) || [])[1] || 0), failed: Number((/^# fail (\d+)$/m.exec(out) || [])[1] || 0) }));
  });
}

(async () => {
  console.log(`suites: ${SUITES.map((file) => path.basename(file, '.test.cjs')).join(', ')}`);
  let survivors = 0;
  for (const mutant of MUTANTS) {
    const result = await run(mutant);
    if (result.error) { console.log(`${result.label}: ERROR ${result.error}`); survivors += 1; continue; }
    if (result.killedBy) console.log(`${result.label}: KILLED by "${result.killedBy}"`);
    else { survivors += 1; console.log(`${result.label}: SURVIVED all ${result.tests} tests (fail ${result.failed})`); }
  }
  console.log(`survivors: ${survivors}`);
  process.exitCode = survivors > 0 ? 1 : 0;
})();
