'use strict';

// Evidence-phase tooling of the third fix (NOT a test, NOT run by the suite, not pinned by any capture; it reports and asserts nothing). Decides
// generated mutants BY HAND with the test files the generator never reached because its first file was cut (a listener that stays open keeps the
// first file's process alive). It uses the generator's own mutants (tests\mutate-gen.cjs generate) and the overlay of tests\fixtures\overlay-preload.cjs,
// exactly as the generator does. Several ids joined with + are applied together (a PAIR of redundant lines). Run it from the repository root.
// usage: node capability\C017\evidence\by-hand-04\by-hand.cjs <mutant id>[+<mutant id>] <test file>...
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repo = path.resolve(__dirname, '..', '..', '..', '..');
const root = path.join(repo, 'capability', 'C017');
const G = require(path.join(root, 'tests', 'mutate-gen.cjs'));
const [idArg, ...files] = process.argv.slice(2);
const ids = idArg.split('+');
const source = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8').replace(/\r\n/g, '\n');
const sites = ids.map((id) => G.generate(source).find((candidate) => candidate.id === id));
if (sites.some((site) => !site)) { console.error(`no mutant ${idArg}`); process.exit(2); }
let mutated = source;
for (const site of [...sites].sort((a, b) => b.from - a.from)) mutated = mutated.slice(0, site.from) + site.replace + mutated.slice(site.to);
const dir = path.join(root, 'test-scratch', `byhand-${idArg.replace(/[^A-Za-z0-9_-]/g, '_')}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'server.cjs'), mutated);
const env = { ...process.env, C017_OVERLAY: JSON.stringify({ 'capability/C017/server.cjs': path.relative(repo, path.join(dir, 'server.cjs')) }), NODE_OPTIONS: '--require=./capability/C017/tests/fixtures/overlay-preload.cjs', NODE_V8_COVERAGE: '' };
delete env.NODE_TEST_CONTEXT;

// --test-force-exit ends a file whose listener the mutant never closed, so that its failing tests are reported at all.
function run(file) {
  return new Promise((resolve) => {
    const args = ['--test', '--test-force-exit', '--test-reporter=tap', '--test-concurrency=1', '--test-timeout=300000', `capability\\C017\\tests\\${file}`];
    const child = spawn(process.execPath, args, { cwd: repo, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (part) => { out += part; });
    child.stderr.on('data', () => {});
    const limit = setTimeout(() => child.kill(), 900000);
    child.once('exit', (code) => {
      clearTimeout(limit);
      const text = out.replace(/\r\n/g, '\n');
      resolve({ file, code, failing: [...text.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1].trim().slice(0, 200)), summary: Object.fromEntries([...text.matchAll(/^# (tests|pass|fail|cancelled) (\d+)/gm)].map((m) => [m[1], Number(m[2])])) });
    });
  });
}

(async () => {
  const results = [];
  try {
    for (const file of files) results.push(await run(file));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ id: idArg, was: sites.map((one) => one.was).join(' + '), results }, null, 1));
})();
