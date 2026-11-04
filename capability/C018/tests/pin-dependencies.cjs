'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { inventory } = require('./provenance.cjs');

const original = {
  C001: 'cfff04364ade947aa398004b21548a15272021e7',
  C002: '5feaab2929a615aa7f6968fd39355868dd321e4f',
  C015: '78341b3370d7764b7f9c3eacc1796892dbc4f40f',
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = [];
const baseline = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
for (const [card, publication] of Object.entries(original)) {
  const names = execFileSync('git', ['ls-tree', '-r', '--name-only', publication, '--', `capability/${card}`],
    { encoding: 'utf8' }).trim().split(/\r?\n/);
  for (const name of names) {
    const tail = name.slice(`capability/${card}/`.length);
    if (tail.includes('/') && !(card === 'C015' && tail.startsWith('fixtures/'))) continue;
    const relative = name.replaceAll('/', path.sep);
    const bytes = fs.readFileSync(relative);
    const originalBlob = execFileSync('git', ['rev-parse', `${publication}:${name}`], { encoding: 'utf8' }).trim();
    const currentBlob = execFileSync('git', ['hash-object', `--path=${name}`, relative], { encoding: 'utf8' }).trim();
    let referenceCommit = publication;
    if (currentBlob !== originalBlob) {
      if (relative !== path.join('capability', 'C002', 'README.md')) throw new Error(`Immutable API/source drift: ${relative}`);
      referenceCommit = '1f1c85d20b6e3bf289b9445154ba867cda11667b';
    }
    const referenceBlob = execFileSync('git', ['rev-parse', `${referenceCommit}:${name}`], { encoding: 'utf8' }).trim();
    if (currentBlob !== referenceBlob) throw new Error(`Reviewed documentation/source reference drift: ${relative}`);
    const canonical = execFileSync('git', ['cat-file', 'blob', referenceBlob], { maxBuffer: 8 * 1024 * 1024 });
    files.push({ path: relative, originalPublication: publication, originalGitBlob: originalBlob,
      referenceCommit, referenceGitBlob: referenceBlob, canonicalSha256: sha(canonical),
      rawSha256: sha(bytes), rawBytes: bytes.length, rawCRLF: bytes.includes(Buffer.from('\r\n')) });
  }
}
const report = { cardId: 'C018', capturedAtUtc: new Date().toISOString(), baselineCommit: baseline,
  acceptedDependencies: original, files,
  documentationFollowup: { path: 'capability\\C002\\README.md', commit: '1f1c85d20b6e3bf289b9445154ba867cda11667b',
    reason: 'Previously published read-only browser verification instructions; no API change or worker edit.' },
  publisher: { path: '.git\\kanban-orchestrator\\publish.ps1', sha256: '48846487727dd2ef35f03d88d65e64121059b6867188bbf34daeaee3fda1c09d' },
  browser: { path: 'testing\\browser\\isolated.cjs', sha256: '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055' },
};
fs.writeFileSync(path.resolve(__dirname, '..', 'evidence', 'dependencies.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ dependencyFiles: files.length, currentSourceFiles: Object.keys(inventory()).length,
  immutableImportedAPIs: true, rawAndGitCanonicalSeparatelyPinned: true }));
