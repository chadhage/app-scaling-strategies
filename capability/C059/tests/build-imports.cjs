'use strict';

// Test tooling, not production code. Writes imports.json: raw, CRLF-to-LF and accepted-Git-blob SHA-256 of every file this
// namespace imports read-only from the accepted C041 and C042. The accepted Git blob of the accepted commit is the anchor
// (L-0116): a file whose working bytes agree with neither the blob nor its LF form is refused. Needs --force to overwrite.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const accepted = {
  C041: { commit: '286f3d7f261144ff165262107bb2b7afe749a754', tag: 'kanban/C041/286f3d7f2611' },
  C042: { commit: '6e088f54beed052bba20e0910f49aca1d583d293', tag: 'kanban/C042/6e088f54beed' },
};
const files = [
  ['C042', 'contract.js', ['server.cjs', 'transcript.cjs', 'journey.js', 'index.html (served as /c042/contract.js)']],
  ['C042', 'engine.cjs', ['server.cjs', 'transcript.cjs', 'tests']], ['C042', 'input.cjs', ['server.cjs']],
  ['C042', 'journal.cjs', ['server.cjs', 'transcript.cjs']], ['C042', 'result.cjs', ['server.cjs']],
  ['C041', 'accepted-catalog.js', ['server.cjs', 'index.html (served as /c041/accepted-catalog.js)']],
  ['C041', 'host-policy.js', ['index.html (served as /c041/host-policy.js)']], ['C041', 'lesson-host.js', ['index.html (served as /c041/lesson-host.js)']],
  ['C041', 'serve.cjs', ['server.cjs (validateCatalog, verifyAsset, lessonCsp)']],
];
const target = path.join(root, 'imports.json');
if (fs.existsSync(target) && process.argv[2] !== '--force') throw new Error('imports.json exists; pass --force to rebuild');
const imports = files.map(([card, name, usedBy]) => {
  const relative = `capability/${card}/${name}`;
  const bytes = fs.readFileSync(path.join(repository, ...relative.split('/')));
  const blob = execFileSync('git', ['--no-pager', 'cat-file', 'blob', `${accepted[card].commit}:${relative}`], { cwd: repository, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  const entry = { card, path: relative, rawSha256: hash(bytes), crlfToLfSha256: hash(normalize(bytes)), acceptedGitSha256: hash(blob), usedBy };
  if (![entry.rawSha256, entry.crlfToLfSha256].includes(entry.acceptedGitSha256)) throw new Error(`${relative} differs from its accepted blob`);
  return entry;
});
const pins = {
  schema: 'C059-import-pins/1', accepted, imports,
  notImported: {
    'capability/C001/contract-guard.js': 'Not imported: C059 does not recheck C001 consent (C042 server.cjs does and reads the live ledger); it only binds 127.0.0.1.',
    'capability/C042/server.cjs': 'Not imported: it serves only C042 assets and reads the live ledger; C059 has its own service over the pinned C042 engine.',
  },
  policy: 'Read-only imports of accepted producer files. Tests recompute every hash against git (git cat-file blob <accepted commit>:<path>) and assert the working bytes equal the accepted blob or its CRLF-to-LF form. Never edit an imported file.',
};
fs.writeFileSync(target, `${JSON.stringify(pins, null, 2)}\n`);
console.log(`wrote ${imports.length} import pins`);
