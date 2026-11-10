'use strict';
const fs = require('node:fs');
const path = require('node:path');
const authority = require('./u072-authority.cjs');
const { ROOT, REPO: REPOSITORY, FREEZE, SEAL, sourceNames, freeze, seal, verifySource, verifyCurrentSeal } = authority;
const PRODUCTION = ['canon.cjs','redact.cjs','vault.cjs','evidence.cjs','service.cjs','server.cjs','page.js'].sort();
function complete() {
  const problems = [...verifySource(), ...verifyCurrentSeal(), ...authority.verifyMutationTransport()];
  const data = authority.catalog();
  for (const kind of ['green-suite','fresh-lf','fresh-crlf','coverage-focused','browser-run','browser-cleanup','loop-load','review-repro','review-flood','red-family','green-family']) {
    const file = authority.current(kind);
    if (!file) { problems.push(`PUBLIC_CURRENT_CAPTURE_MISSING: ${kind}`); continue; }
    problems.push(...authority.verifyPublicCapture(file));
  }
  const mutation = authority.mutationEvidence();
  problems.push(...require('./evidence-check.cjs').checkMutants(mutation));
  for (const entry of data.origins) {
    const file = path.join(ROOT, entry.publicProjection);
    if (!fs.existsSync(file)) { problems.push(`PRIVATE_DOCUMENT_PROJECTION_MISSING: ${entry.publicProjection}`); continue; }
    const projection = JSON.parse(fs.readFileSync(file));
    if (projection.origin.sha256 !== entry.originSha256 || projection.role !== entry.role) problems.push(`PRIVATE_DOCUMENT_ROLE_CHANGED: ${entry.publicProjection}`);
  }
  return problems;
}
if (require.main === module) {
  const operation = process.argv[2];
  if (operation === 'freeze') console.log(`U072 public source frozen: ${freeze()} files`);
  else if (operation === 'seal') console.log(`U072 complete public seal: ${seal()} files`);
  else {
    const problems = operation === '--complete' ? complete() : [...verifySource(), ...verifyCurrentSeal()];
    console.log(JSON.stringify({ schema: 'U072-public-complete/1', ok: problems.length === 0, problems }, null, 2));
    if (problems.length) process.exitCode = 1;
  }
}
module.exports = { ...authority, ROOT, REPOSITORY, FREEZE, SEAL, PRODUCTION, sourceNames, freeze, seal, verifySource, verifyCurrentSeal, complete };
