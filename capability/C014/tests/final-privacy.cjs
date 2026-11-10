'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const { ROOT, REPOSITORY, index, sha } = require('./final-base.cjs');
const { scan } = require('./scanner.cjs');
const PRIVATE_PREFIXES = [
  'evidence/final-20261110/red-final-behavior-01/',
  'evidence/final-20261110/red-final-flood-01/',
  'evidence/final-20261110/green-final-focused-01/'
];
function identifiers() {
  const user = /[\\/]Users[\\/]([^\\/]+)/i.exec(REPOSITORY)?.[1];
  assert.ok(user, 'the local identifier audit has a positive local user source');
  const given = JSON.parse(process.env.C014_PRIVATE_IDENTIFIERS || '[]');
  assert.ok(given.some((entry) => entry.id === 'parent-session'), 'the explicit parent-session audit needle is required');
  const execution = /execution-\d+-([a-f0-9]+)/i.exec(REPOSITORY)?.[1];
  return [{ id: 'local-user', value: user }, ...(execution ? [{ id: 'execution-prefix', value: execution }] : []), ...given];
}
function walk(directory, relative = '') {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('an audit input cannot be a link');
    if (entry.isDirectory()) { if (entry.name !== 'scratch') found.push(...walk(path.join(directory, entry.name), name)); }
    else found.push({ name, path: path.join(directory, entry.name) });
  }
  return found;
}
function findings(bytes, name, needles) {
  const streams = [{ kind: 'file', bytes }];
  if (name.endsWith('.gz')) streams.push({ kind: 'decoded-gzip', bytes: zlib.gunzipSync(bytes) });
  return streams.flatMap((stream) => scan(stream.bytes, needles).map((hit) => ({ id: hit.id, form: hit.form, stream: stream.kind })));
}
function audit() {
  const needles = identifiers();
  const baseline = index().files;
  const proposed = [];
  const privatePreserved = [];
  const inherited = [];
  const problems = [];
  let decodedStreams = 0;
  for (const file of walk(ROOT)) {
    const bytes = fs.readFileSync(file.path);
    const original = baseline[file.name];
    const unchanged = original && sha(bytes) === original.rawSha256;
    const hits = findings(bytes, file.name, needles);
    if (file.name.endsWith('.gz')) decodedStreams += 1;
    if (unchanged) {
      if (hits.length) inherited.push({ path: file.name, hits });
      continue;
    }
    if (PRIVATE_PREFIXES.some((prefix) => file.name.startsWith(prefix))) {
      privatePreserved.push({ path: file.name, sha256: sha(bytes), hits });
      continue;
    }
    proposed.push({ path: file.name, sha256: sha(bytes) });
    if (hits.length) problems.push({ path: file.name, hits });
  }
  const fixture = Buffer.from(`fixture ${needles[0].value} end`);
  assert.ok(findings(fixture, 'fixture.txt', needles).some((hit) => hit.id === 'local-user'));
  assert.ok(findings(zlib.gzipSync(fixture), 'fixture.raw.gz', needles).some((hit) => hit.id === 'local-user' && hit.stream === 'decoded-gzip'));
  return { schema: 'C014-proposed-file-privacy/1', proposedCount: proposed.length, decodedStreams, proposed, problems,
    privatePreserved, inherited,
    limits: 'Exact historical bytes stay unchanged. The closed private-only attempt directories are not proposed for publication; original private bytes are never edited or relabeled as public raw.' };
}
if (require.main === module) {
  const report = audit();
  const out = process.argv.find((arg) => arg.startsWith('--out='));
  if (out) fs.writeFileSync(out.slice(6), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ proposed: report.proposedCount, decodedStreams: report.decodedStreams, problems: report.problems,
    privatePreservedFiles: report.privatePreserved.length, inheritedIdentifierFiles: report.inherited.length }, null, 2));
  if (report.problems.length) process.exitCode = 1;
}
module.exports = { identifiers, findings, audit };
