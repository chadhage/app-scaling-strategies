'use strict';

// Per-file 85/85/85 coverage over the ENUMERATED production files: one L-0004 command per file (L-0100), an unloaded file prints
// no row and counts as 0% (L-0028, L-0043), and an unenumerated root JavaScript file is refused.
//   node capability\C017\tests\coverage.cjs                      prints JSON, exit 1 below any threshold
//   node capability\C017\tests\coverage.cjs --archive <name>     also writes evidence\<name>\manifest.json and gzip transcripts
// Whole-namespace coverage is a heavy run: hold a heavy slot (RUN\scripts\heavy-slot.ps1) while it runs.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');

const root = path.join(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const production = ['contract.js', 'reconcile.cjs', 'journal.cjs', 'engine.cjs', 'server.cjs', 'cli.cjs', 'page.js'];
const suites = fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.cjs')).sort();
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function unenumerated() {
  return fs.readdirSync(root).filter((name) => /\.(c?js|mjs)$/.test(name) && !production.includes(name));
}

function runOne(file) {
  const rel = `capability/C017/${file}`;
  const args = ['--test', '--test-reporter=tap', '--test-concurrency=1', '--test-timeout=170000', '--experimental-test-coverage', `--test-coverage-include=${rel}`,
    '--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85', ...suites.map((name) => `capability/C017/tests/${name}`)];
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  delete env.C017_TEST_ENGINE;
  return new Promise((resolve) => {
    const started = Date.now();
    const out = [];
    const err = [];
    const child = spawn(process.execPath, args, { cwd: repo, env, windowsHide: true });
    const timer = setTimeout(() => child.kill(), 900000);
    child.stdout.on('data', (part) => out.push(part));
    child.stderr.on('data', (part) => err.push(part));
    child.on('close', (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString('utf8');
      const row = new RegExp(`^#\\s+${file.replace('.', '\\.')}\\s+\\|\\s+([\\d.]+)\\s+\\|\\s+([\\d.]+)\\s+\\|\\s+([\\d.]+)\\s+\\|`, 'm').exec(stdout);
      const count = (label) => Number((new RegExp(`^# ${label} (\\d+)`, 'm').exec(stdout) || [0, 0])[1]);
      resolve({
        file, command: `node ${args.slice(0, 9).join(' ')} <${suites.length} test files>`, exit: code, seconds: Math.round((Date.now() - started) / 100) / 10,
        lines: row ? Number(row[1]) : 0, branches: row ? Number(row[2]) : 0, functions: row ? Number(row[3]) : 0, rowPresent: Boolean(row),
        tests: count('tests'), pass: count('pass'), fail: count('fail'), stdout, stderr: Buffer.concat(err).toString('utf8'),
      });
    });
  });
}

async function main() {
  const extra = unenumerated();
  if (extra.length) throw new Error(`unenumerated root JavaScript: ${extra.join(', ')}`);
  const results = [];
  const queue = [...production];
  await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) results.push(await runOne(queue.shift())); }));
  results.sort((a, b) => production.indexOf(a.file) - production.indexOf(b.file));
  const failing = results.filter((r) => r.exit !== 0 || !r.rowPresent || r.lines < 85 || r.branches < 85 || r.functions < 85 || r.fail !== 0);
  const summary = results.map(({ file, lines, branches, functions, exit, seconds, tests, pass, fail, rowPresent }) => ({ file, lines, branches, functions, exit, seconds, tests, pass, fail, rowPresent }));
  const archiveAt = process.argv.indexOf('--archive');
  if (archiveAt > 0) {
    const dir = path.join(root, 'evidence', process.argv[archiveAt + 1]);
    fs.mkdirSync(path.join(dir, 'raw'), { recursive: true });
    for (const r of results) {
      fs.writeFileSync(path.join(dir, 'raw', `${r.file}.stdout.raw.gz`), zlib.gzipSync(r.stdout), { flag: 'wx' });
      fs.writeFileSync(path.join(dir, 'raw', `${r.file}.stderr.raw.gz`), zlib.gzipSync(r.stderr), { flag: 'wx' });
    }
    const manifest = {
      schema: 'C017-coverage/1', node: process.version, threshold: { lines: 85, branches: 85, functions: 85 }, perFileCommands: results.map((r) => ({ file: r.file, command: r.command })),
      inputs: [...production.map((f) => ({ path: f, sha256: sha(path.join(root, f)) })), ...suites.map((f) => ({ path: `tests/${f}`, sha256: sha(path.join(__dirname, f)) }))],
      results: summary, passed: failing.length === 0,
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  }
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failing.length ? 1 : 0);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(2); });
module.exports = Object.freeze({ production, unenumerated, runOne });
