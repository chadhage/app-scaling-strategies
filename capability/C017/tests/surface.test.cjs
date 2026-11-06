'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const s = require('./support.cjs');

const root = s.root;
const run = promisify(execFile);
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const red = path.join(root, 'evidence', 'red', 'red-01-naive-cancel-always-succeeds');
const production = ['contract.js', 'reconcile.cjs', 'journal.cjs', 'engine.cjs', 'server.cjs', 'cli.cjs', 'page.js'];

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['test-scratch', 'state'].includes(entry.name) && dir === root) continue;
    const full = path.join(dir, entry.name);
    found.push({ full, rel: path.relative(root, full).replaceAll('\\', '/'), link: fs.lstatSync(full).isSymbolicLink(), dir: entry.isDirectory() });
    if (entry.isDirectory() && !fs.lstatSync(full).isSymbolicLink()) walk(full, found);
  }
  return found;
}

test('the live initial tests are byte-identical to the retained RED inputs and the retained RED is a behavioral failure', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(red, 'manifest.json'), 'utf8'));
  for (const item of [...manifest.inputs, ...manifest.outputs]) assert.equal(sha(path.join(root, item.path)), item.sha256, item.path);
  for (const live of ['outcomes.test.cjs', 'races.test.cjs', 'interrupted.test.cjs', 'support.cjs']) {
    assert.equal(sha(path.join(__dirname, live)), sha(path.join(red, live.replace(/\.cjs$/, '.snapshot.cjs'))), `${live} was weakened or changed after the RED`);
  }
  assert.equal(manifest.exitCode, 1);
  assert.deepEqual([manifest.summary.tests, manifest.summary.pass, manifest.summary.fail], [16, 0, 16]);
  assert.deepEqual(manifest.summary.failureCodes, { ERR_ASSERTION: 16 });
  assert.equal(fs.readFileSync(path.join(red, 'stderr.txt'), 'utf8'), '');
  assert.equal(fs.readFileSync(path.join(red, 'exit-code.txt'), 'utf8').trim(), '1');
});

test('the retained RED replays against the archived naive engine and passes unchanged against the final code', async () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  delete env.C017_TEST_ENGINE;
  const tool = path.join(__dirname, 'red-run.cjs');
  const [replayed, green] = await Promise.all(['replay', 'verify-green'].map((mode) => run(process.execPath, [tool, mode, 'red-01-naive-cancel-always-succeeds'], { env, timeout: 120000, maxBuffer: 1 << 24 })));
  assert.equal(JSON.parse(replayed.stdout).reproduced, true);
  assert.equal(JSON.parse(green.stdout).unchangedRedPassesAgainstFinalCode, true);
});

test('the second retained RED (a defect found after the first GREEN) pins its inputs, replays on the retained pre-fix engine and is fixed in the final engine', async () => {
  const name = 'red-02-completed-undecided-cancel-window';
  const dir = path.join(root, 'evidence', 'red', name);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  // The fix cycle after the independent review changed contract.js, reconcile.cjs and journal.cjs: their pins are checked against the retained
  // first-publication bytes (evidence\red\prefix-ed21ef79, itself pinned by evidence.test.cjs), every other input against the live file.
  const retained = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'red', 'prefix-ed21ef79', 'manifest.json'), 'utf8')).files;
  const pinnedFile = (rel) => { const kept = retained.find((item) => item.live === `capability/C017/${rel}`); return kept ? path.join(root, '..', '..', kept.snapshot) : path.join(root, rel); };
  for (const item of [...manifest.inputs, ...manifest.outputs]) assert.equal(sha(pinnedFile(item.path)), item.sha256, item.path);
  assert.equal(manifest.exitCode, 1);
  assert.deepEqual([manifest.summary.tests, manifest.summary.fail, manifest.summary.failureCodes], [1, 1, { JOURNAL_INCONSISTENT: 1 }]);
  assert.notEqual(sha(path.join(root, 'engine.cjs')), sha(path.join(dir, 'engine.prefix.snapshot.cjs')), 'the final engine differs from the retained pre-fix engine');
  assert.match(fs.readFileSync(path.join(root, 'engine.cjs'), 'utf8'), /if \(pending\) return failure\('CANCEL_IN_PROGRESS', cmd\);\r?\n\s+if \(a\.cancel\) return failure\('ALREADY_TERMINAL', cmd\);/);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  delete env.C017_TEST_ENGINE;
  const replayed = await run(process.execPath, [path.join(__dirname, 'red-run.cjs'), 'replay-fix', name], { env, timeout: 120000, maxBuffer: 1 << 24 });
  assert.equal(JSON.parse(replayed.stdout).reproduced, true);
});

test('no override of the engine under test is active in the GREEN run', () => {
  assert.equal(process.env.C017_TEST_ENGINE, undefined);
});

test('the namespace has no link, junction or nested repository, and only the expected top-level names', () => {
  const entries = walk(root);
  assert.deepEqual(entries.filter((e) => e.link).map((e) => e.rel), []);
  assert.deepEqual(entries.filter((e) => e.rel.split('/').includes('.git')).map((e) => e.rel), []);
  const top = entries.filter((e) => !e.rel.includes('/')).map((e) => e.rel).sort();
  assert.deepEqual(top, ['.gitattributes', '.gitignore', 'C017.feature', 'README.md', 'cli.cjs', 'contract.js', 'engine.cjs', 'evidence', 'imports.json', 'index.html', 'journal.cjs', 'page.js', 'reconcile.cjs', 'server.cjs', 'style.css', 'tests'].sort());
  assert.equal(fs.readFileSync(path.join(root, '.gitattributes'), 'utf8').split(/\r?\n/)[0], '* -text');
});

test('every authored text file has consistent CRLF endings, a final newline, no trailing whitespace and no BOM', () => {
  const authored = walk(root).filter((e) => !e.dir && !e.rel.startsWith('evidence/') && /\.(js|cjs|json|html|css|md|feature|ps1)$|^\.git/.test(e.rel));
  assert.ok(authored.length >= 30);
  const problems = [];
  for (const file of authored) {
    const text = fs.readFileSync(file.full, 'utf8');
    if (text.charCodeAt(0) === 0xfeff) problems.push(`${file.rel}: BOM`);
    if (!text.endsWith('\n')) problems.push(`${file.rel}: no final newline`);
    if (/(^|[^\r])\n/.test(text)) problems.push(`${file.rel}: a bare LF among CRLF`);
    if (/[ \t]+\r?\n/.test(text)) problems.push(`${file.rel}: trailing whitespace`);
    if (/\r\r/.test(text)) problems.push(`${file.rel}: doubled CR`);
  }
  assert.deepEqual(problems, []);
});

test('every JavaScript file parses', () => {
  const files = walk(root).filter((e) => !e.dir && /\.c?js$/.test(e.rel) && !e.rel.startsWith('evidence/red/'));
  assert.ok(files.length >= 25);
  for (const file of files) assert.doesNotThrow(() => new vm.Script(`(function (exports, require, module, __filename, __dirname) {${fs.readFileSync(file.full, 'utf8').replace(/^#!.*/, '')}\n})`, { filename: file.full }), file.rel);
});

test('the feature names every outcome and the README carries the exact commands of the independent reviewer', () => {
  const feature = fs.readFileSync(path.join(root, 'C017.feature'), 'utf8');
  assert.equal((feature.match(/^ {2}Scenario:/gm) || []).length, 23);
  for (const outcome of s.OUTCOMES) assert.ok(feature.includes(outcome), outcome);
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  for (const command of ['red-run.cjs replay red-01-naive-cancel-always-succeeds', 'red-run.cjs verify-green red-01-naive-cancel-always-succeeds', 'node --test --test-concurrency=1 (Get-ChildItem capability\\C017\\tests\\*.test.cjs).FullName',
    'node capability\\C017\\tests\\coverage.cjs', '--test-coverage-include=capability/C017/engine.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85', 'node capability\\C017\\tests\\browser.cjs', 'node capability\\C017\\tests\\anchor.cjs',
    'node capability\\C017\\cli.cjs']) assert.ok(readme.includes(command), command);
  for (const script of ['red-run.cjs', 'coverage.cjs', 'browser.cjs', 'anchor.cjs', 'green.cjs']) assert.ok(fs.existsSync(path.join(__dirname, script)), script);
  assert.match(readme, /blocks every write/);
  assert.match(readme, /No power-loss durability/);
  assert.deepEqual(production.filter((file) => !fs.existsSync(path.join(root, file))), []);
});

test('the archived real-Edge observation has no repeated ids, a contiguous journal and a Microsoft signature (L-0118)', () => {
  const file = path.join(root, 'evidence', 'browser-observation.json');
  assert.ok(fs.existsSync(file), 'the real-Edge observation was never captured');
  const observation = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(observation.schema, 'C017-browser-observation/1');
  assert.equal(observation.edge.signature, 'Valid');
  assert.match(observation.edge.signer, /Microsoft Corporation/);
  assert.match(observation.edge.version, /^156\./);
  assert.match(observation.edge.sha256, /^[0-9a-f]{64}$/);
  assert.match(observation.limits, /every POST is blocked/);
  assert.ok(observation.scenarios.length >= 6);
  for (const { scenario, final } of observation.scenarios) {
    assert.equal(new Set(final.ids).size, final.ids.length, `${scenario}: repeated element ids`);
    assert.equal(new Set(final.journal).size, final.journal.length, `${scenario}: repeated journal line`);
    const numbers = final.journal.map((line) => /^#(\d+) /.exec(line)).filter(Boolean).map((m) => Number(m[1]));
    numbers.forEach((n, i) => assert.equal(n, numbers[0] + i, `${scenario}: numbering`));
    assert.equal(new Set(final.steps).size, final.steps.length);
    const compensated = /^Stopped after step \d+ and reversed by journaled compensating steps/.test(final.outcome);
    if (!compensated) {
      const text = final.outcome.replace(/Nothing was undone or rolled back\.|nothing to undo|Nothing is claimed as cancelled, completed or undone\.|nothing is claimed as cancelled, stopped, started or undone\./gi, '');
      assert.doesNotMatch(text, /undone|rolled back|reversed/i, `${scenario}: the outcome overstates`);
    }
  }
  assert.ok(observation.scenarios.some((x) => /blocked cancel/.test(x.scenario) && /not delivered/.test(x.final.outcome)));
});
