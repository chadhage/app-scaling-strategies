'use strict';

// Test tooling, not production code (U039 fix 4): the whole non-browser suite of the namespace, FILE BY FILE (one `node --test --test-concurrency=1` process per
// file, run one after the other, a hard external timeout per file), with the time of every file. It prints one JSON line per file and the totals as TAP
// comments (`# tests`, `# pass`, `# fail`), so that the shared recorder fills the summary of its manifest. Exit 0 only when every file passed.
// Usage (repository root): node capability\C042\tests\u039-suite.cjs [fileCapSeconds]
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const lib = require('./u039-lib.cjs');

const repository = path.resolve(__dirname, '..', '..', '..');
const cap = Number(process.argv[2] ?? 1800) * 1000;
const env = lib.childEnv();
for (const key of ['U039_SUBJECT', 'U039_CLOSE_MS', 'U039_STRICT_EVIDENCE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[key];
const files = fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.cjs')).sort();

function one(name) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', path.join('capability', 'C042', 'tests', name)], { cwd: repository, env, windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    let timedOut = false;
    // The tree of the child this tool started is stopped by its PID (a test that hung must not leave a process behind).
    const timer = setTimeout(() => { timedOut = true; spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); }, cap);
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = Buffer.concat(chunks).toString('utf8');
      const get = (key) => Number((new RegExp(`^# ${key} (\\d+)`, 'm').exec(text) ?? [])[1] ?? NaN);
      const result = { file: name, exit: code, timedOut, seconds: Math.round((Date.now() - started) / 100) / 10, tests: get('tests'), pass: get('pass'), fail: get('fail'), skipped: get('skipped'), cancelled: get('cancelled'), failed: [...text.matchAll(/^not ok \d+ - (.*)$/gm)].map((match) => match[1]) };
      console.log(JSON.stringify(result));
      resolve(result);
    });
  });
}

(async () => {
  const started = Date.now();
  const results = [];
  for (const name of files) results.push(await one(name));
  const sum = (key) => results.reduce((total, item) => total + (Number.isFinite(item[key]) ? item[key] : 0), 0);
  const bad = results.filter((item) => item.exit !== 0 || item.timedOut || item.fail !== 0 || !(item.tests > 0));
  console.log(`# files ${results.length}`);
  console.log(`# tests ${sum('tests')}`);
  console.log(`# pass ${sum('pass')}`);
  console.log(`# fail ${sum('fail')}`);
  console.log(`# skipped ${sum('skipped')}`);
  console.log(`# cancelled ${sum('cancelled')}`);
  console.log(JSON.stringify({ summary: true, files: results.length, seconds: Math.round((Date.now() - started) / 100) / 10, slowest: [...results].sort((a, b) => b.seconds - a.seconds).slice(0, 6).map((item) => `${item.file} ${item.seconds}s`), failures: bad.map((item) => `${item.file}: ${item.failed.join(' | ') || (item.timedOut ? 'TIMEOUT' : `exit ${item.exit}`)}`) }));
  process.exitCode = bad.length === 0 ? 0 : 1;
})();
