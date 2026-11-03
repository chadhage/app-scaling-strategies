'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..', '..', '..');
const evidence = path.join(__dirname, '..', 'evidence');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = [
  ['README.md', 'readme', (text) => {
    const row = text.match(/^\| S053 \|[^\n]*\n/gm);
    assert.equal(row?.length, 1);
    assert.ok(row[0].includes('Use versioned endpoints or transitional adapters instead of abruptly changing a live contract.'));
    return row[0] + text.slice(text.indexOf('## Acceptance and evidence'), text.indexOf('## Recommended demonstration sequence'));
  }],
  [path.join('.docs', 'wiki', 'backlog.md'), 'backlog', (text) => {
    const row = text.match(/^\| D-S053 \|[^\n]*\n/gm);
    assert.equal(row?.length, 1);
    assert.ok(row[0].includes('A stable compatible route can migrate all consumers; a breaking API cannot be force-rerouted and declared uninterrupted.'));
    return row[0] + text.slice(text.indexOf('## Completion and evidence policy'));
  }],
  [path.join('.docs', 'wiki', 'kanban.md'), 'portable-contract', (text) => {
    const row = text.match(/^\| A-S053 \|[^\n]*\n/gm);
    assert.equal(row?.length, 1);
    const packet = text.match(/^Packet membership is fixed[^\n]*\n/m);
    assert.ok(packet?.[0].includes('SC-Snnn'));
    return row[0] + text.slice(text.indexOf('## Atomic card contract'), text.indexOf('## Concurrent pull and one-piece flow')) + packet[0];
  }],
];
fs.mkdirSync(evidence, { recursive: true });
const sources = files.map(([relative, label, extract]) => {
  const raw = fs.readFileSync(path.join(root, relative));
  const text = raw.toString('utf8');
  const snapshot = Buffer.from(extract(text), 'utf8');
  const name = `source-${label}.snapshot`;
  fs.writeFileSync(path.join(evidence, name), snapshot, { flag: 'wx' });
  return {
    path: relative, rawFileSha256AtRead: hash(raw),
    canonicalFileSha256AtRead: hash(Buffer.from(text.replace(/\r\n/g, '\n'))),
    snapshot: name, snapshotBytes: snapshot.length, rawSnapshotSha256: hash(snapshot),
    canonicalSnapshotSha256: hash(Buffer.from(snapshot.toString('utf8').replace(/\r\n/g, '\n'))),
    rawCRLFPairs: (snapshot.toString('utf8').match(/\r\n/g) || []).length,
  };
});
const record = {
  cardId: 'A-S053', parentId: 'D-S053', sourceId: 'S053', packet: 'SC-S053',
  kano: 'S', kanoUnit: 'A-S053', owner: 'worker-A-S053',
  readAtUtc: new Date().toISOString(),
  headAtRead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceRow: 'Breaking API introduction: Use versioned endpoints or transitional adapters instead of abruptly changing a live contract.',
  exactBacklogAcceptance: 'A stable compatible route can migrate all consumers; a breaking API cannot be force-rerouted and declared uninterrupted.',
  scope: 'Portable local synthetic A card only. B-S053, D-S053 and prerequisites D-S051/D-S052 remain separate; no native completion.',
  rawPreservation: 'Snapshots retain original CRLF bytes; evidence/** is -text. Canonical LF hashes qualify Git text sources separately.',
  sources,
};
fs.writeFileSync(path.join(evidence, 'source-contract.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(record, null, 2));
