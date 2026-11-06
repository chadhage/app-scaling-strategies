'use strict';

// Test tooling, not production code. Writes imports.json: raw, CRLF-to-LF and accepted-Git-blob SHA-256 of every accepted
// file of another namespace that C043 reads (read-only), anchored to the accepted commits and tags (L-0116: the pins are
// recomputed against git by tests\surface.test.cjs, not trusted from the file next to them). Needs --force to overwrite.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const accepted = {
  C042: { commit: '6e088f54beed052bba20e0910f49aca1d583d293', tag: 'kanban/C042/6e088f54beed' },
  C001: { commit: 'cfff04364ade947aa398004b21548a15272021e7', tag: 'kanban/C001/cfff04364ade' },
};
const files = [
  ['C042', 'capability/C042/contract.js', ['contract.js', 'page (served as c042-contract.js)']], ['C042', 'capability/C042/input.cjs', ['preset.cjs', 'tests']],
  ['C042', 'capability/C042/engine.cjs', ['server.cjs', 'transcript.cjs', 'tests']], ['C042', 'capability/C042/journal.cjs', ['runlog.cjs', 'server.cjs', 'tests']],
  ['C001', 'capability/C001/contract-guard.js', ['server.cjs']], ['C001', 'capability/C001/approved-contract.js', ['capability/C001/contract-guard.js', 'tests']],
];
const target = path.join(root, 'imports.json');
if (fs.existsSync(target) && process.argv[2] !== '--force') throw new Error('imports.json exists; pass --force to rebuild');
const imports = {};
for (const [card, relative, usedBy] of files) {
  const bytes = fs.readFileSync(path.join(repository, relative));
  const run = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: repository, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  const blob = run('cat-file', 'blob', `${accepted[card].commit}:${relative}`);
  const entry = {
    card, gitBlob: run('rev-parse', `${accepted[card].commit}:${relative}`).toString().trim(), acceptedGitSha256: hash(blob),
    rawSha256: hash(bytes), canonicalLfSha256: hash(normalize(bytes)), usedBy,
  };
  if (![entry.rawSha256, entry.canonicalLfSha256].includes(entry.acceptedGitSha256)) throw new Error(`${relative} differs from its accepted blob`);
  imports[relative] = entry;
}
const pins = {
  schema: 'C043-imports/1', accepted, imports,
  notImported: {
    'capability/C017': 'Not imported: reconciliation is a separate card; C043 invents no undo.',
    'capability/C009': 'Not imported: under repair after review; its refusal lessons are applied in this namespace by structure (one central send path, a table-driven refusal test, a cross-process flood test).',
  },
  policy: 'Read-only imports of accepted producer files. Tests recompute every pin against git at the accepted commit; the working files must equal the blob or its LF form.',
};
fs.writeFileSync(target, `${JSON.stringify(pins, null, 2)}\n`);
console.log(`wrote ${files.length} pins`);
