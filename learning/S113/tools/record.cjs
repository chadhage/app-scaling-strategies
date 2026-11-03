'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const proof = require('./proof.cjs');
const { root, repo, hash, lf, read, json, writeJson, raw, snapshots } = proof;
const git = (args) => execFileSync('git', args, { cwd: repo });
const stage = process.argv[2];
const run = (args) => spawnSync(process.execPath, args, { cwd: repo, encoding: 'buffer', timeout: 120000 });
const output = (scope, name, result) => ({
  status: result.status, signal: result.signal, error: result.error ? String(result.error) : null,
  stdout: raw(scope, `${name}-stdout`, result.stdout || Buffer.alloc(0)),
  stderr: raw(scope, `${name}-stderr`, result.stderr || Buffer.alloc(0)),
});
if (stage === 'source') {
  const canonicalCommit = git(['rev-parse', 'HEAD']).toString('utf8').trim();
  const inventory = JSON.parse(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'inventory.json')));
  const card = inventory.cards.find((item) => item.id === 'A-S113');
  const nativeSibling = inventory.cards.find((item) => item.id === 'B-S113');
  assert.equal(card.packet, 'SC-S113');
  assert.equal(card.kano, 'S');
  assert.equal(card.deliver, 'Evacuate a region; require warm capacity, synchronized state, and exclusive writer ownership.');
  const entries = [
    ['readme', 'README.md', canonicalCommit],
    ['backlog', '.docs/wiki/backlog.md', canonicalCommit],
    ['kanban', '.docs/wiki/kanban.md', canonicalCommit],
    ['helper', 'testing/browser/isolated.cjs', '53c0c0d'],
  ].map(([name, source, commit]) => {
    const working = fs.readFileSync(path.join(repo, ...source.split('/')));
    const canonical = git(['show', `${commit}:${source}`]);
    return { name, source, canonicalCommit: commit, working: raw('source', `${name}-working`, working),
      canonicalGit: raw('source', `${name}-canonical`, canonical), workingLfSha256: hash(lf(working)),
      workingLfEqualsCanonical: lf(working).equals(canonical), workingEqualsCanonicalBytes: working.equals(canonical) };
  });
  assert.equal(entries.find((item) => item.name === 'helper').working.sha256,
    '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  writeJson('source.json', { schemaVersion: 1, stage: 'Frozen exact source and BDD', capturedAtUtc: new Date().toISOString(),
    canonicalCommit, card, nativeSibling, packet: 'SC-S113', entries, bdd: raw('source', 'lesson-feature', read('lesson.feature')) });
} else if (stage === 'red') {
  const startedAtUtc = new Date().toISOString();
  const names = ['.gitattributes', 'lesson.feature', 'index.html', 'lesson.css', 'model.js', 'lesson.js',
    'tests\\model.test.cjs', 'tools\\syntax.cjs', 'tools\\record.cjs', 'tools\\proof.cjs'];
  const frozen = snapshots('red', names);
  const precheck = run(['-e', "const assert=require('node:assert/strict'); const api=require('./learning/S113/model.js'); assert.equal(typeof api.createState,'function'); assert.equal(typeof api.step,'function'); require('./learning/S113/tools/syntax.cjs'); console.log('Loadable stub API and standalone scripts');"]);
  const result = run(['--test', 'learning\\S113\\tests\\model.test.cjs']);
  assert.equal(precheck.status, 0);
  assert.equal(result.status, 1);
  assert.equal(result.signal, null);
  assert.equal(result.error, undefined);
  const text = result.stdout.toString('utf8');
  assert.match(text, /ERR_ASSERTION/);
  assert.match(text, /actual: 'positive'/);
  assert.match(text, /expected: 'negative'/);
  assert.doesNotMatch(text, /MODULE_NOT_FOUND|SyntaxError/);
  writeJson('red-001.json', { stage: 'Genuine behavioral assertion RED', startedAtUtc, finishedAtUtc: new Date().toISOString(),
    acceptedBehavioralRed: true, precheck: output('red', 'precheck', precheck), ...output('red', 'assertion', result), snapshots: frozen });
  console.log('Retained genuine RED: cold capacity expected negative, stub returned positive.');
} else if (stage === 'iac') {
  const red = json('evidence\\red-001.json');
  const stub = red.snapshots.find((item) => item.source === 'model.js');
  assert.equal(hash(read('model.js')), stub.sha256);
  writeJson('iac-na.json', { stage: 'IaC N/A', recordedAtUtc: new Date().toISOString(),
    previousStageSha256: hash(read('evidence\\red-001.json')), stubUnchangedAtThisStage: true,
    applicability: 'N/A — resource-free standalone browser lesson; no infrastructure, identity, cloud operations or packages are needed.',
    generatedInfrastructureFiles: [], approvedScope: 'learning\\S113 only; fixed fictional teaching DATA ONLY' });
  console.log('IaC N/A recorded before replacing the unchanged stub.');
} else if (stage === 'green') {
  const startedAtUtc = new Date().toISOString();
  const cases = [
    ['focused', ['--test', 'learning\\S113\\tests\\model.test.cjs', 'learning\\S113\\tests\\integrity.test.cjs',
      'learning\\S113\\tests\\browser-proof.test.cjs']],
    ['syntax', ['learning\\S113\\tools\\syntax.cjs']],
    ['browser-readonly', ['learning\\S113\\tools\\browser.cjs']],
  ];
  const before = proof.tree();
  assert.notEqual(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Green verification must be read-only.');
  const runs = cases.map(([name, args]) => {
    const result = run(args);
    if (result.status !== 0 || result.signal || result.error) {
      process.stdout.write(result.stdout || Buffer.alloc(0));
      process.stderr.write(result.stderr || Buffer.alloc(0));
      throw new Error(`${name} verification failed (${result.status})`);
    }
    return { name, command: `node ${args.join(' ')}`, result };
  });
  assert.deepEqual(proof.tree(), before, 'Verification must preserve all lesson and proof bytes.');
  writeJson('green-001.json', { stage: 'Focused green, syntax and actual-browser read-only replay',
    startedAtUtc, finishedAtUtc: new Date().toISOString(), normalVerificationPreservedTree: true,
    treeBefore: before, runs: runs.map(({ name, command, result }) => ({ name, command, ...output('green-001', name, result) })) });
  console.log('Focused green, syntax and actual-browser read-only replay passed; original bytes unchanged.');
} else {
  throw new Error('Explicit recording stage required: source, red, iac or green. Normal tests never record.');
}
