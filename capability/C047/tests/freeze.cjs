'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { root, verifySelection } = require('./selection.cjs'), { list, sha, scan } = require('./privacy.cjs');
const output = process.env.C047_CAPTURE_DIR, metadata = process.env.C047_METADATA;
assert.ok(output && metadata, 'EXPLICIT_OWN_FINAL_FREEZE_CAPTURE_AND_METADATA');
const before = list(root), selected = verifySelection(), source = JSON.parse(fs.readFileSync(path.join(metadata, 'authority-initial.json')));
const index = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'index.json')));
const privacy = scan(root);
assert.equal(privacy.findingsFiles, 0, 'ALL_ACTUAL_FINAL_PUBLIC_FILES_AND_EXPANDED_DATA_ARE_PRIVATE_IDENTIFIER_FREE');
const rows = before.map(relative => {
  const bytes = fs.readFileSync(path.join(root, relative)), textual = /\.(cjs|ps1|md|feature)$/.test(relative), lf = textual ? Buffer.from(bytes.toString().replace(/\r\n/g, '\n')) : bytes,
    crlf = textual ? Buffer.from(lf.toString().replace(/\n/g, '\r\n')) : bytes;
  const role = selected.production.includes(relative) ? 'complete-new-production-executable' :
    selected.rootTestTooling.includes(relative) || relative.startsWith('tests' + path.sep) ? 'test-verification-tooling-or-test-suite' :
    relative.startsWith('evidence' + path.sep) ? 'explicit-public-projection-or-index-NOT-original-raw' : 'documentation-policy-or-input-binding';
  return { path: relative.replaceAll('\\', '/'), role, bytes: bytes.length, actualWorkingSha256: sha(bytes), filteredGitSha256: sha(lf),
    freshLfSha256: sha(lf), freshCrlfSha256: sha(crlf), policy: textual ? 'text eol=lf, explicit fresh LF/CRLF executables' : 'raw -text, never normalize' };
});
assert.deepEqual(list(root), before, 'NO_SOURCE_FILE_CREATED_OR_OMITTED_WHILE_FREEZING');
const captures = fs.readdirSync(path.join(metadata, 'captures'), { withFileTypes: true }).filter(entry => entry.isDirectory() &&
  fs.existsSync(path.join(metadata, 'captures', entry.name, 'result.json'))).map(entry => {
    const directory = path.join(metadata, 'captures', entry.name), result = fs.readFileSync(path.join(directory, 'result.json'));
    return { label: entry.name, resultSha256: sha(result), result: JSON.parse(result), sourcesManifestSha256: sha(fs.readFileSync(path.join(directory, 'inputs.json'))) };
  });
const envelope = { schema: 'C047-source-complete-private-final-freeze/1', cardId: 'C047', originalKanoUnit: 'C047', frozenClass: 'D',
  originalAcceptance: 'Enforce preview authorization on every reachable candidate path; unauthorized direct access remains denied.',
  originalGoSha256: 'a12c19ed76ba3446f40ccae5c4e43ab9f853d857a59328bfa16a3f2ddb00e984', fixedDeadlineUtc: '2026-11-12T03:45:05.2317838Z',
  actualParentRepositoryHeadAtAdmission: source.head, candidatePublishedHead: null, fakeC047HeadCreated: false,
  completeNewProductionExecutables: selected.production, allActualTestFiles: selected.suites, actualNamespaceFiles: rows.length, files: rows,
  namespaceSelectionSha256: sha(Buffer.from(JSON.stringify(rows))), producerAuthoritySha256: sha(fs.readFileSync(path.join(root, 'imports.json'))),
  browserAuthoritySha256: sha(fs.readFileSync(path.join(root, 'browser-imports.json'))), projectionsIndexSha256: sha(fs.readFileSync(path.join(root, 'evidence', 'index.json'))),
  explicitRetainedPrivateRawFilesInPublicIndex: index.originalPrivateFiles.length, everyActualCompletedPrivateCapture: captures,
  privacy: { actualFiles: privacy.allActualPublicFiles, actualExpandedOrDecodedViews: privacy.scannedViews, findingsFiles: privacy.findingsFiles },
  noLiveApplicationPublicationAcceptanceOrCreditAuthority: true, sourceCorporaRetained: true };
fs.writeFileSync(path.join(output, 'source-freeze.json'), JSON.stringify(envelope, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(output, 'privacy.json'), JSON.stringify(privacy, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ actualNamespaceFiles: rows.length, namespaceSelectionSha256: envelope.namespaceSelectionSha256, captures: captures.length,
  retainedPrivateRawBindings: index.originalPrivateFiles.length, privacyFindings: privacy.findingsFiles, publishedC047HeadClaimed: null }));
