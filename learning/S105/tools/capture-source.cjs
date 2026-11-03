'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const output = path.join(root, 'evidence', 'raw', 'source');
const manifestPath = path.join(root, 'evidence', 'source.json');
if (fs.existsSync(manifestPath)) throw new Error('Source provenance already exists; refusing replacement.');
fs.mkdirSync(output, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 8 * 1024 * 1024 });
const commit = git('rev-parse', 'HEAD').toString('utf8').trim();
const sources = [
  ['readme', 'README.md'],
  ['backlog', '.docs/wiki/backlog.md'],
  ['kanban', '.docs/wiki/kanban.md'],
  ['helper', 'testing/browser/isolated.cjs'],
];
const entries = sources.map(([name, gitPath]) => {
  const working = fs.readFileSync(path.join(repo, ...gitPath.split('/')));
  const canonicalCommit = name === 'helper' ? '53c0c0d' : commit;
  const canonical = git('show', `${canonicalCommit}:${gitPath}`);
  const save = (kind, bytes) => {
    const file = `${name}.${kind}.raw.gz`;
    fs.writeFileSync(path.join(output, file), gzipSync(bytes), { flag: 'wx' });
    const text = bytes.toString('utf8');
    return {
      file: `raw/source/${file}`,
      sha256: hash(bytes),
      bytes: bytes.length,
      crlf: (text.match(/\r\n/g) || []).length,
      lf: (text.match(/\n/g) || []).length,
    };
  };
  return {
    name,
    source: gitPath,
    canonicalCommit,
    working: save('working', working),
    canonicalGit: save('git', canonical),
    workingLfSha256: hash(Buffer.from(working.toString('utf8').replace(/\r\n/g, '\n'))),
    workingEqualsCanonicalBytes: working.equals(canonical),
    workingLfEqualsCanonical: Buffer.from(working.toString('utf8').replace(/\r\n/g, '\n')).equals(canonical),
  };
});
const helper = entries.find((entry) => entry.name === 'helper');
if (helper.working.sha256 !== '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055') {
  throw new Error('Published helper raw-byte hash mismatch; no alternate helper authorized.');
}
const inventory = JSON.parse(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'inventory.json')));
const card = inventory.cards.find((entry) => entry.id === 'A-S105');
if (!card || card.kano !== 'S' || card.packet !== 'SC-S105') throw new Error('Inventory contract mismatch.');
const provenance = {
  schemaVersion: 1,
  capturedAtUtc: new Date().toISOString(),
  sourceCommit: commit,
  card,
  authorization: 'local-synthetic-only',
  entries,
  qualification: {
    rawBytes: 'Working-file SHA-256 and CRLF counts are preserved independently of canonical Git blobs.',
    canonicalGit: 'Git show supplies exact committed bytes; source rows are qualified separately from mutable board totals.',
    helper: 'Only published 53c0c0d API, exact approved working-byte hash; lifecycle prototype remains unqualified.',
    noNativeProof: true,
  },
};
fs.writeFileSync(manifestPath, `${JSON.stringify(provenance, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(provenance, null, 2));
