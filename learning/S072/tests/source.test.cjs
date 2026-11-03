'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const owned = path.resolve(__dirname, '..');
const repo = path.resolve(owned, '..', '..');
const read = (file) => fs.readFileSync(path.join(owned, file));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const parse = (file) => JSON.parse(read(file));
const contract = parse('evidence\\source-contract.json');
const normalize = (text) => text.replaceAll('\r\n', '\n');
const sourceRow = '| S072 | **Cache stampede after cutover:** Coalesce or limit refill work so cold caches do not overload the database. |';
const backlogRow = '| D-S072 | P1 | Add cold-cache burst and coalesced/bounded refill comparison controls. | Refill strategy is evidenced by data-tier load and journey latency; stampede-induced failures stay counted. | none |';
const cardRow = '| A-S072 | D-S072 | S | Compare unbounded and coalesced refill; identify a database-overloading stampede. | SOURCE |';

function select(text, selection) {
  if (selection.row) {
    const row = text.split(/(?<=\n)/).find((line) => line.startsWith(`| ${selection.row} |`));
    assert.ok(row, `exact source row ${selection.row} exists`);
    return Buffer.from(row);
  }
  const start = text.indexOf(selection.start);
  assert.notEqual(start, -1);
  const end = text.indexOf(selection.end, start + selection.start.length);
  assert.ok(end > start);
  return Buffer.from(text.slice(start, end));
}

test('exact source objective, parent acceptance, frozen class, and packet are retained', () => {
  assert.equal(contract.cardId, 'A-S072');
  assert.equal(contract.workerId, 'worker-A-S072');
  assert.equal(contract.parentId, 'D-S072');
  assert.equal(contract.packet, 'SC-S072');
  assert.equal(contract.kano, 'S');
  assert.equal(read('evidence\\raw\\source\\readme-row.git.snapshot').toString().trimEnd(), sourceRow);
  assert.equal(read('evidence\\raw\\source\\backlog-row.git.snapshot').toString().trimEnd(), backlogRow);
  assert.equal(read('evidence\\raw\\source\\a-card.git.snapshot').toString().trimEnd(), cardRow);
  const claim = parse('evidence\\raw\\source\\claimed-card.json');
  assert.equal(claim.state, 'In Progress');
  assert.equal(claim.owner, 'worker-A-S072');
  assert.equal(claim.packet, 'SC-S072');
  assert.equal(claim.kanoUnit, 'A-S072');
  assert.equal(claim.authorization, 'local-synthetic-only');
});

test('canonical Git-source integrity is qualified independently of working CRLF', () => {
  assert.match(contract.sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(contract.proofs.length, 7);
  for (const proof of contract.proofs) {
    const canonicalFile = execFileSync('git', ['show', `${contract.sourceCommit}:${proof.path.replaceAll('\\', '/')}`], { cwd: repo });
    const fromGit = select(canonicalFile.toString('utf8'), proof);
    const canonicalSnapshot = read(proof.gitPath);
    const workingSnapshot = read(proof.workingPath);
    assert.equal(hash(fromGit), proof.canonicalGitSha256, proof.name);
    assert.deepEqual(canonicalSnapshot, fromGit, proof.name);
    assert.equal(hash(workingSnapshot), proof.workingSha256, proof.name);
    assert.equal(normalize(workingSnapshot.toString()), normalize(canonicalSnapshot.toString()), proof.name);
    const current = select(fs.readFileSync(path.join(repo, proof.path), 'utf8'), proof);
    assert.equal(normalize(current.toString()), normalize(canonicalSnapshot.toString()), `current exact source selection ${proof.name}`);
  }
});

test('BDD and portable bundle preserve the source contract and its evidence limits', () => {
  const atomic = read('evidence\\raw\\source\\atomic-portable.git.snapshot').toString();
  assert.ok(atomic.includes('genuine behavioral TDD red'));
  assert.ok(atomic.includes('### Portable A-card lesson contract'));
  assert.ok(atomic.includes('The native implementation and evidence remain a separate B card'));
  const lesson = parse('lesson.json');
  assert.equal(lesson.objective, contract.objective);
  assert.equal(lesson.packet, contract.packet);
  assert.equal(lesson.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  const feature = read('refill.feature').toString();
  for (const term of ['6 fail', 'latency', 'unknown', '12 runs', 'keyboard', 'CSP']) {
    assert.ok(feature.toLowerCase().includes(term.toLowerCase()), term);
  }
  assert.ok(read('evidence\\raw\\source\\b-card.git.snapshot').toString().includes('CORE, DATA, HOST'));
  assert.ok(read('evidence\\raw\\source\\acceptance.git.snapshot').toString().includes('failed or uncertain started transitions must not be removed from the denominator'));
});

test('RED is an actual loaded assertion with preserved, non-discovered source snapshots', () => {
  const red = parse('evidence\\raw\\commands\\red-model.json');
  const stdout = read('evidence\\raw\\commands\\red-model.stdout');
  const stderr = read('evidence\\raw\\commands\\red-model.stderr');
  assert.equal(red.exitCode, 1);
  assert.equal(red.signal, null);
  assert.equal(red.spawnError, null);
  assert.equal(hash(stdout), red.stdoutSha256);
  assert.equal(hash(stderr), red.stderrSha256);
  assert.match(stdout.toString(), /code: 'ERR_ASSERTION'/);
  assert.match(stdout.toString(), /actual: 0/);
  assert.match(stdout.toString(), /expected: 8/);
  assert.doesNotMatch(stdout.toString() + stderr.toString(), /MODULE_NOT_FOUND|SyntaxError|command not found/);
  for (const file of ['model.js', 'tests\\model.test.cjs', 'refill.feature', '.gitattributes']) {
    const snapshot = `evidence\\red\\${file.replaceAll('\\', '-')}.snapshot`;
    assert.equal(hash(read(snapshot)), red.sources.find((source) => source.path === file).sha256, snapshot);
    assert.ok(snapshot.endsWith('.snapshot'));
  }
  assert.ok(new Date(contract.capturedAtUtc) <= new Date(red.startedAtUtc));
  const iac = parse('evidence\\iac-decision.json');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.afterBehavioralRed, 'evidence\\raw\\commands\\red-model.json');
  assert.equal(iac.resourcesGenerated, false);
});

test('static DOM has only local assets, guarded controls, exact banner, and strict CSP', () => {
  const html = read('index.html').toString();
  const app = read('app.js').toString();
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'"]) {
    assert.ok(csp.includes(directive), directive);
  }
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
  assert.equal((html.match(/Training rehearsal - synthetic data - not a live Azure result/g) || []).length, 1);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /(?:id|name)="reset"/i);
  assert.doesNotMatch(html, /(?:src|href)="(?:https?:|\/\/|data:)/i);
  assert.doesNotMatch(app, /innerHTML|fetch\(|XMLHttpRequest|localStorage|setInterval|setTimeout/);
  assert.match(app, /form\.reset\(\)/);
});
