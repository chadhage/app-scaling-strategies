'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { gzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stage = process.argv[2];
const writeJson = (name, value) => {
  const file = path.join(evidence, name);
  assert.equal(fs.existsSync(file), false, `Historical evidence must not be overwritten: ${name}`);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
function preserve(relative, bytes) {
  const file = path.join(evidence, 'raw', ...relative.split('\\'));
  assert.equal(fs.existsSync(file), false);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, gzipSync(bytes, { mtime: 0 }));
  return {
    file: path.relative(evidence, file).split(path.sep).join('/'),
    bytes: bytes.length, sha256: hash(bytes),
    crlf: (bytes.toString('utf8').match(/\r\n/g) || []).length,
  };
}
function git(args) { return execFileSync('git', ['--no-pager', ...args], { cwd: repo }); }
function snapshot(relative, prefix) {
  const bytes = fs.readFileSync(path.join(root, relative));
  return { source: relative.split(path.sep).join('/'), ...preserve(`${prefix}\\${relative.replace(/[\\/]/g, '_')}.raw.gz`, bytes) };
}

if (stage === 'source') {
  fs.mkdirSync(evidence, { recursive: true });
  const attributes = git(['check-attr', 'text', '--', 'learning\\S108\\evidence\\raw\\source\\probe.raw.gz']).toString('utf8');
  assert.match(attributes, /text: unset/);
  const commit = git(['rev-parse', 'HEAD']).toString('utf8').trim();
  const inventory = JSON.parse(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'inventory.json')));
  const cards = inventory.cards.filter((card) => ['A-S108', 'B-S108'].includes(card.id));
  assert.equal(cards.length, 2);
  const entries = [
    ['readme', 'README.md', commit],
    ['backlog', '.docs/wiki/backlog.md', commit],
    ['kanban', '.docs/wiki/kanban.md', commit],
    ['helper', 'testing/browser/isolated.cjs', '53c0c0d'],
  ].map(([name, source, canonicalCommit]) => {
    const working = fs.readFileSync(path.join(repo, ...source.split('/')));
    const canonical = git(['show', `${canonicalCommit}:${source}`]);
    const normalized = Buffer.from(working.toString('utf8').replace(/\r\n/g, '\n'));
    return {
      name, source, canonicalCommit,
      working: preserve(`source\\${name}.working.raw.gz`, working),
      canonicalGit: preserve(`source\\${name}.canonical.raw.gz`, canonical),
      workingLfSha256: hash(normalized),
      workingLfEqualsCanonical: normalized.equals(canonical),
      workingEqualsCanonicalBytes: working.equals(canonical),
    };
  });
  const kanban = fs.readFileSync(path.join(repo, '.docs', 'wiki', 'kanban.md'), 'utf8');
  const portableA = kanban.split('### Portable A-card lesson contract')[1].split('## Concurrent pull')[0].trim();
  assert.ok(portableA.includes('Training rehearsal - synthetic data - not a live Azure result'));
  writeJson('source.json', {
    capturedAtUtc: new Date().toISOString(), workingHead: commit,
    card: cards.find((card) => card.id === 'A-S108'),
    packet: { id: 'SC-S108', originalMembers: cards, additionalCredits: 0 },
    portableA: { source: '.docs/wiki/kanban.md', heading: 'Portable A-card lesson contract', text: portableA },
    entries,
  });
} else if (stage === 'red') {
  assert.ok(fs.existsSync(path.join(evidence, 'source.json')));
  const startedAtUtc = new Date().toISOString();
  const precheckArgs = ['-e', "const a=require('node:assert/strict'),m=require('.\\\\learning\\\\S108\\\\model.js');a.equal(typeof m.createState,'function');a.equal(typeof m.transition,'function');a.equal(m.createState().phase,'ready');console.log('Loadable stub API; behavioral assertion comes next')"];
  const precheck = spawnSync(process.execPath, precheckArgs, { cwd: repo });
  assert.equal(precheck.status, 0, 'Stub API must genuinely load');
  const args = ['--test', 'learning\\S108\\tests\\model.test.cjs'];
  const result = spawnSync(process.execPath, args, { cwd: repo });
  assert.equal(result.status, 1, 'The original behavioral test must genuinely fail');
  assert.match(result.stdout.toString('utf8'), /ERR_ASSERTION/);
  assert.match(result.stdout.toString('utf8'), /applied/);
  assert.doesNotMatch(result.stdout.toString('utf8') + result.stderr.toString('utf8'), /MODULE_NOT_FOUND|SyntaxError/);
  writeJson('red-001.json', {
    stage: 'BDD -> loadable stub -> assertion RED', startedAtUtc,
    finishedAtUtc: new Date().toISOString(), invocation: [process.execPath, ...args],
    status: result.status, acceptedResult: true,
    stdout: preserve('red\\stdout.raw.gz', result.stdout),
    stderr: preserve('red\\stderr.raw.gz', result.stderr),
    precheck: {
      invocation: [process.execPath, ...precheckArgs], status: precheck.status,
      stdout: preserve('red\\precheck-stdout.raw.gz', precheck.stdout),
      stderr: preserve('red\\precheck-stderr.raw.gz', precheck.stderr),
    },
    snapshots: ['lesson.feature', 'model.js', 'tests\\model.test.cjs', 'tools\\stages.cjs']
      .map((relative) => snapshot(relative, 'red')),
  });
} else if (stage === 'iac-na') {
  const redPath = path.join(evidence, 'red-001.json');
  const red = JSON.parse(fs.readFileSync(redPath));
  const stub = red.snapshots.find((entry) => entry.source === 'model.js');
  assert.equal(hash(fs.readFileSync(path.join(root, 'model.js'))), stub.sha256);
  writeJson('iac-na.json', {
    stage: 'IaC N/A', recordedAtUtc: new Date().toISOString(),
    reason: 'Resource-free standalone browser lesson; fixed fictional WAF/policy/rule/traffic/asset/routing/authentication DATA ONLY.',
    previousStageSha256: hash(fs.readFileSync(redPath)), stubUnchangedAtThisStage: true,
    cloudOperations: 0, resources: 0, authorizedSpend: 0, additionalKanoCredits: 0,
  });
} else {
  throw new Error('Deliberate stage capture requires source, red or iac-na; no default capture.');
}
console.log(`S108 ${stage} evidence preserved`);
