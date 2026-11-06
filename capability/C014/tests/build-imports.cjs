'use strict';

// Test tooling, not production code. Writes imports.json: raw, CRLF-to-LF and git-blob SHA-256 of every file of ANOTHER namespace that C014 imports (read-only),
// anchored to the C009 commit and tag whose PRODUCTION bytes C014 was built on (C009 was not yet accepted when C014 started; its third fix 0da3ff6eea40 was accepted
// later with every production file byte-identical, so the pins stay at f95cc52a29cf and the later commit is a second anchor). C009 tests and evidence are never imported.
// tests\integrity.test.cjs recomputes every pin against git at both commits (L-0116) and against the working files. Needs --force to overwrite.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const accepted = { C009: { commit: 'f95cc52a29cf643fd443b80e5c0b112556feb548', tag: 'kanban/C009/f95cc52a29cf', confirmed: { commit: '0da3ff6eea40c6051a103f96c04ab668b95538d6', tag: 'kanban/C009/0da3ff6eea40' } } };
const files = [
  ['contract.js', ['vault.cjs', 'redact.cjs', 'service.cjs']], ['authz.cjs', ['service.cjs', 'server.cjs']], ['codes.cjs', ['redact.cjs', 'server.cjs']],
  ['commands.cjs', ['service.cjs']], ['handlers.cjs', ['commands.cjs (C009)', 'ledger.cjs (C009)']], ['http-io.cjs', ['server.cjs', 'tests']], ['ledger.cjs', ['service.cjs']], ['queue.cjs', ['service.cjs']]
];
const target = path.join(root, 'imports.json');
if (fs.existsSync(target) && process.argv[2] !== '--force') throw new Error('imports.json exists; pass --force to rebuild');
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: repository, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
const imports = {};
for (const [name, usedBy] of files) {
  const relative = `capability/C009/${name}`;
  const bytes = fs.readFileSync(path.join(repository, relative));
  const blob = git('cat-file', 'blob', `${accepted.C009.commit}:${relative}`);
  const entry = {
    card: 'C009', gitBlob: git('rev-parse', `${accepted.C009.commit}:${relative}`).toString().trim(), acceptedGitSha256: hash(blob), rawSha256: hash(bytes), canonicalLfSha256: hash(normalize(bytes)), usedBy
  };
  if (![entry.rawSha256, entry.canonicalLfSha256].includes(entry.acceptedGitSha256) && hash(normalize(blob)) !== entry.canonicalLfSha256) throw new Error(`${relative} differs from the pinned C009 blob`);
  imports[relative] = entry;
}
const pins = {
  schema: 'C014-imports/1', accepted, imports,
  notImported: {
    'capability/C009/tests': 'Never imported: C009 tests and evidence are not part of the fixture; the importer section of the C009 README is tested there against the real exports, but the code, not the prose, is what C014 trusts.',
    'capability/C009/server.cjs': 'Not imported: its routes are fixed and public (GET /v1/state would serve unredacted state); C014 wires its own routes onto the C009 refusal path.'
  },
  status: 'C009 is ACCEPTED: its independent review accepted the third fix 0da3ff6eea40 (tag kanban/C009/0da3ff6eea40), whose eight imported production files are byte-identical to the pinned f95cc52a29cf (only its README, tests and evidence changed), so no pin changed and none was re-made. C014 itself is not reviewed yet.',
  policy: 'Read-only imports of the C009 production files at the pinned commit. Tests recompute every pin against git and the working files must equal the blob or its LF form.'
};
fs.writeFileSync(target, `${JSON.stringify(pins, null, 2)}\n`);
console.log(`wrote ${files.length} pins`);
