'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const repo = path.resolve(__dirname, '..', '..', '..');
const evidence = path.join(__dirname, '..', 'evidence');
const hash = (raw) => createHash('sha256').update(raw).digest('hex');
const canonical = (raw) => Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
const extracts = [
  ['README.md', 'source-readme.snapshot', (text) => {
    const row = text.match(/^\| S058 \|[^\n]*\n/gm);
    assert.equal(row?.length, 1);
    assert.ok(row[0].includes('Pin or explicitly version long-lived workflows so new code does not invalidate existing execution history.'));
    return row[0];
  }],
  [path.join('.docs', 'wiki', 'backlog.md'), 'source-backlog.snapshot', (text) => {
    const row = text.match(/^\| D-S058 \|[^\n]*\n/gm);
    assert.equal(row?.length, 1);
    assert.ok(row[0].includes('Existing histories continue under the correct version strategy; unexpected replay/history behavior is detected.'));
    const prerequisite = text.match(/^\| P004 \|[^\n]*\n/gm);
    assert.equal(prerequisite?.length, 1);
    return row[0] + prerequisite[0];
  }],
  [path.join('.docs', 'wiki', 'kanban.md'), 'source-portable-contract.snapshot', (text) => {
    const row = text.match(/^\| A-S058 \|[^\n]*\n/gm);
    const sibling = text.match(/^\| B-S058 \|[^\n]*\n/gm);
    const packet = text.match(/^Packet membership is fixed[^\n]*\n/m);
    assert.equal(row?.length, 1);
    assert.equal(sibling?.length, 1);
    assert.ok(packet?.[0].includes('SC-Snnn'));
    return row[0] + sibling[0]
      + text.slice(text.indexOf('## Atomic card contract'), text.indexOf('## Concurrent pull and one-piece flow'))
      + packet[0];
  }],
];
const sources = extracts.map(([relative, snapshot, extract]) => {
  const raw = fs.readFileSync(path.join(repo, relative));
  const bytes = Buffer.from(extract(raw.toString('utf8')));
  fs.writeFileSync(path.join(evidence, snapshot), bytes, { flag: 'wx' });
  return {
    path: relative, rawFileSha256AtRead: hash(raw), canonicalFileSha256AtRead: hash(canonical(raw)),
    snapshot, snapshotBytes: bytes.length, rawSnapshotSha256: hash(bytes),
    canonicalSnapshotSha256: hash(canonical(bytes)), crlfPairs: (bytes.toString('utf8').match(/\r\n/g) || []).length,
  };
});
const record = {
  cardId: 'A-S058', parentId: 'D-S058', sourceId: 'S058', kano: 'S', kanoUnit: 'A-S058',
  packet: 'SC-S058', workerId: 'worker-A-S058', readAtUtc: new Date().toISOString(),
  headAtRead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  sourceLocation: 'Exact S058 row in repository README.md; there is no separate source S058/README in this supplied tree.',
  objective: 'Replay durable execution history under different versions; identify the valid version-match strategy.',
  exactSourceAcceptance: 'Pin or explicitly version long-lived workflows so new code does not invalidate existing execution history.',
  exactBacklogAcceptance: 'Existing histories continue under the correct version strategy; unexpected replay/history behavior is detected.',
  boundary: 'Portable synthetic model only; B-S058, D-S058, P004, actual durable engine replay/storage and production runtime qualification remain incomplete.',
  refinement: 'One coherent version-match rehearsal; no subdivision, extra unit, native admission, or unrelated To Do change.',
  sources,
};
fs.writeFileSync(path.join(evidence, 'source-contract.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(record, null, 2));
