'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const sources = [
  { path: 'README.md', name: 'readme', kind: 'row', token: '| S056 |' },
  { path: '.docs\\wiki\\backlog.md', name: 'backlog', kind: 'row', token: '| D-S056 |' },
  { path: '.docs\\wiki\\kanban.md', name: 'a-card', kind: 'row', token: '| A-S056 |' },
  { path: '.docs\\wiki\\kanban.md', name: 'b-card', kind: 'row', token: '| B-S056 |' },
  { path: '.docs\\wiki\\kanban.md', name: 'portable-contract', kind: 'section',
    token: '### Portable A-card lesson contract', end: '## Concurrent pull and one-piece flow' },
  { path: '.docs\\wiki\\kanban.md', name: 'atomic-contract', kind: 'section',
    token: '## Atomic card contract', end: '### Portable A-card lesson contract' },
  { path: '.docs\\wiki\\kanban.md', name: 'scenario-rule', kind: 'section',
    token: '## Scenario cards', end: '### A. Deployment and traffic migration' },
];

function extract(bytes, spec) {
  const text = bytes.toString('utf8');
  if (spec.kind === 'row') {
    const matches = text.match(/^.*(?:\r?\n|$)/gm).filter((line) => line.startsWith(spec.token));
    if (matches.length !== 1) throw new Error(`Expected exact source row ${spec.token}.`);
    return Buffer.from(matches[0]);
  }
  const begin = text.indexOf(spec.token);
  const end = text.indexOf(spec.end, begin + spec.token.length);
  if (begin < 0 || end < 0) throw new Error(`Missing bounded source contract ${spec.name}.`);
  return Buffer.from(text.slice(begin, end));
}

function git(args) {
  const result = spawnSync('git', ['--no-pager', ...args], { cwd: repo, encoding: null });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr.toString());
  return result.stdout;
}

function capture() {
  const evidence = path.join(root, 'evidence');
  fs.mkdirSync(evidence, { recursive: true });
  if (fs.existsSync(path.join(evidence, 'source-contract.json'))) {
    throw new Error('Original raw source provenance is immutable; verification compares canonical Git sources without recapture.');
  }
  const sourceCommit = git(['rev-parse', 'HEAD']).toString().trim();
  const records = sources.map((spec) => {
    const working = fs.readFileSync(path.join(repo, spec.path));
    const raw = extract(working, spec);
    const blob = git(['rev-parse', `${sourceCommit}:${spec.path.replace(/\\/g, '/')}`]).toString().trim();
    const committed = git(['cat-file', 'blob', blob]);
    const committedExcerpt = extract(committed, spec);
    if (!canonical(raw).equals(canonical(committedExcerpt))) throw new Error(`Unpublished source drift: ${spec.name}`);
    const snapshot = `source-${spec.name}.snapshot`;
    fs.writeFileSync(path.join(evidence, snapshot), raw);
    return { ...spec, snapshot, rawWorkingFileSha256: sha(working), rawSnapshotSha256: sha(raw),
      canonicalExcerptSha256: sha(canonical(raw)), gitBlob: blob, canonicalGitFileSha256: sha(committed) };
  });
  const inventory = JSON.parse(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'inventory.json')));
  const cards = inventory.cards.filter((card) => ['A-S056', 'B-S056'].includes(card.id));
  if (cards.length !== 2 || cards.some((card) => card.packet !== 'SC-S056' || card.kano !== 'S')) {
    throw new Error('Exact source inventory packet/class mismatch.');
  }
  const controller = fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'state.ps1'));
  const mapping = controller.toString().match(/^.*elseif \(\$id -match '\^\[AB\].*(?:\r?\n|$)/m);
  if (!mapping) throw new Error('Missing exact SC packet assignment rule.');
  fs.writeFileSync(path.join(evidence, 'source-packet-rule.snapshot'), mapping[0]);
  const record = {
    cardId: 'A-S056', parentId: 'D-S056', sourceId: 'S056', packet: 'SC-S056', kano: 'S',
    sourceCommit, capturedAtUtc: new Date().toISOString(),
    qualification: 'Raw working-tree CRLF excerpts preserved unchanged; canonical Git blob/excerpt checks separately qualify source integrity, not native or source-parent behavior.',
    records, inventoryCards: cards,
    packetRule: { snapshot: 'source-packet-rule.snapshot', sha256: sha(Buffer.from(mapping[0])),
      controllerRawSha256: sha(controller), provenance: 'Runtime control script; not a committed source blob.' },
    scope: 'learning\\S056\\** only; one frozen S unit. B-S056 and D-S056 remain incomplete.',
  };
  fs.writeFileSync(path.join(evidence, 'source-contract.json'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`Captured ${records.length} exact source excerpts and the SC-S056 packet rule at ${sourceCommit}.`);
}

if (require.main === module) {
  if (process.argv[2] !== '--capture') throw new Error('Source capture requires explicit --capture.');
  capture();
}
module.exports = { sources, extract, canonical, sha, git };
