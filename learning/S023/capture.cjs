'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const evidence = path.join(__dirname, 'evidence');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const owned = name => path.join(__dirname, name);
const git = args => execFileSync('git', ['--no-pager', ...args], { cwd: root, encoding: 'utf8' }).trim();
const write = (name, bytes) => fs.writeFileSync(path.join(evidence, name), bytes, { flag: 'wx' });
const [stage, label = stage] = process.argv.slice(2);
assert.match(label || '', /^[a-z][a-z0-9-]{0,60}$/, 'safe, new evidence label required');
fs.mkdirSync(evidence, { recursive: true });

if (stage === 'inputs') {
  const sources = [
    ['README.md', 225, 235],
    [path.join('.docs', 'wiki', 'backlog.md'), 187, 195],
    [path.join('.docs', 'wiki', 'kanban.md'), 117, 153],
    [path.join('.docs', 'wiki', 'kanban.md'), 364, 365]
  ].map(([relativePath, start, end]) => {
    const bytes = fs.readFileSync(path.join(root, relativePath));
    const excerpt = bytes.toString('utf8').split(/\r?\n/).slice(start - 1, end).join('\n');
    return { path: relativePath, sha256: sha(bytes), startLine: start, endLine: end,
      excerpt, excerptSha256: sha(excerpt) };
  });
  const ledger = JSON.parse(fs.readFileSync(path.join(root, '.docs', 'wiki', 'flow-state.json'), 'utf8'));
  const card = ledger.cards.find(item => item.id === 'A-S023');
  assert.equal(card.owner, 'worker-A-S023');
  assert.equal(card.packet, 'SC-S023');
  write('source-inputs.json', JSON.stringify({
    recordedAtUtc: new Date().toISOString(), sourceCommit: git(['rev-parse', 'HEAD']),
    source: 'S023 in README.md; there is no separate S023 source directory in this checkout.',
    card, packet: { id: card.packet, kanoUnit: card.kanoUnit, additionalCompanions: [],
      reason: 'SC-S023 is the implicit source packet for A/B-S023, not a delighter packet.' },
    refinement: 'One bounded A-card exercise; no extra test, plumbing or refinement unit. B-S023/native parent remains separate and unqualified.',
    sources
  }, null, 2) + '\n');
  console.log('Recorded exact S023, D-S023, portable contract, card and packet inputs.');
  process.exit(0);
}

const tests = name => path.join('learning', 'S023', 'tests', name);
const commands = {
  'stub-load': [[
    '-e',
    "const a=require('node:assert/strict');const l=require('./learning/S023/lesson.js');" +
    "a.equal(typeof l.createSession,'function');a.equal(typeof l.run,'function');" +
    "a.equal(l.run(l.createSession(),l.DEFAULTS).history[0].outcome,'unknown');" +
    "console.log('Loadable stub executed a synthetic unknown observation; no import/tool failure.');"
  ]],
  'behavioral-red': [['--test', '--test-name-pattern=a shallow probe cannot hide a rejected representative transaction', tests('lesson.test.cjs')]],
  'focused': [['--test', '--test-concurrency=1', tests('lesson.test.cjs'), tests('surface.test.cjs'), tests('browser.test.cjs')]],
  'syntax': ['lesson.js', 'app.js', 'capture.cjs', path.join('tests', 'lesson.test.cjs'),
    path.join('tests', 'surface.test.cjs'), path.join('tests', 'browser.test.cjs')].map(name => ['--check', owned(name)])
};
assert.ok(Object.hasOwn(commands, stage), 'unsupported capture stage');
if (stage === 'focused') assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'focused proof refresh must be deliberate');
assert.ok(!fs.existsSync(path.join(evidence, `${label}.json`)), 'never overwrite existing proof; use a new label');

const inputs = {};
for (const name of ['journey.feature', 'lesson.js', 'app.js', 'index.html', 'styles.css', 'manifest.json', 'capture.cjs', 'README.md', '.gitattributes',
  path.join('tests', 'lesson.test.cjs'), path.join('tests', 'surface.test.cjs'), path.join('tests', 'browser.test.cjs')]) {
  if (fs.existsSync(owned(name))) inputs[name] = sha(fs.readFileSync(owned(name)));
}
if (stage === 'behavioral-red') {
  const red = path.join(evidence, 'red');
  fs.mkdirSync(red, { recursive: true });
  for (const [source, snapshot] of [['lesson.js', 'lesson.stub.js.txt'],
    [path.join('tests', 'lesson.test.cjs'), 'lesson.test.cjs.txt'], ['journey.feature', 'journey.feature.txt']]) {
    fs.copyFileSync(owned(source), path.join(red, snapshot), fs.constants.COPYFILE_EXCL);
  }
}
const startedAtUtc = new Date().toISOString();
const results = commands[stage].map(args => {
  const child = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  return { executable: process.execPath, args, status: child.status, signal: child.signal,
    error: child.error ? child.error.message : null, stdout: child.stdout || '', stderr: child.stderr || '' };
});
const stdout = results.map(result => result.stdout).join('');
const stderr = results.map(result => result.stderr + (result.error ? `${result.error}\n` : '')).join('');
write(`${label}.stdout.txt`, stdout);
write(`${label}.stderr.txt`, stderr);
write(`${label}.json`, JSON.stringify({
  cardId: 'A-S023', workerId: 'worker-A-S023', packet: 'SC-S023', kano: 'S',
  stage, startedAtUtc, completedAtUtc: new Date().toISOString(), node: process.version,
  sourceCommit: git(['rev-parse', 'HEAD']), inputs, commands: results.map(({ stdout, stderr, ...result }) => result),
  stdoutSha256: sha(stdout), stderrSha256: sha(stderr),
  expected: stage === 'behavioral-red' ? 'Assertion failure: healthy HTTP 200 must not approve a rejected business transaction.' : 'All commands exit zero.',
  limitations: 'Local synthetic lesson and Node 22 tooling only; not production Node 24, native Azure, parent acceptance or reliability certification.'
}, null, 2) + '\n');
process.stdout.write(stdout);
process.stderr.write(stderr);
const successful = results.every(result => result.status === 0 && !result.error);
process.exitCode = stage === 'behavioral-red' ? (successful ? 2 : 1) : (successful ? 0 : 1);
