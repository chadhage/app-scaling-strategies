'use strict';
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), assert = require('node:assert/strict');
const { root, verifySelection } = require('./selection.cjs');
const { sha, project, list, scan } = require('./privacy.cjs');
const metadata = process.env.C047_METADATA, capture = process.env.C047_CAPTURE_DIR;
assert.ok(metadata && capture, 'EXPLICIT_OWN_PRIVATE_METADATA_AND_CAPTURE_REQUIRED');
const destination = path.join(root, 'evidence', 'public-v1');
assert.equal(fs.existsSync(destination), false, 'PUBLIC_PROJECTIONS_NEVER_OVERWRITE_AN_ATTEMPT');
fs.mkdirSync(destination, { recursive: true });
const completed = fs.readdirSync(path.join(metadata, 'captures'), { withFileTypes: true }).filter(entry => entry.isDirectory() &&
  fs.existsSync(path.join(metadata, 'captures', entry.name, 'result.json'))).map(entry => entry.name).sort();
const scopes = [
  { label: 'preflight', directory: path.join(metadata, 'preflight') },
  ...completed.map(label => ({ label: 'capture-' + label, directory: path.join(metadata, 'captures', label) }))
];
const archives = [], failures = [], originalFiles = [];
for (const scope of scopes) {
  const records = [];
  for (const relative of list(scope.directory)) {
    const file = path.join(scope.directory, relative), original = fs.readFileSync(file);
    let payload = original, expandedGzip = false;
    if (payload[0] === 0x1f && payload[1] === 0x8b) { payload = zlib.gunzipSync(payload, { maxOutputLength: 256 * 1024 * 1024 }); expandedGzip = true; }
    const transformed = project(payload.toString('utf8')), projected = Buffer.from(transformed.text);
    const program = /\.(cjs|js|ps1)(\.source\.txt)?$/.test(relative), logicalPath = relative.replaceAll('\\', '/') + (program && !relative.endsWith('.source.txt') ? '.source.txt' : '');
    const record = { schema: 'C047-explicit-portable-projection-NOT-original-raw-or-executed-history/1',
      originalPrivateRelativePath: path.relative(metadata, file).replaceAll('\\', '/'), originalPrivateRawSha256: sha(original), originalPrivateRawBytes: original.length,
      publicLogicalPath: logicalPath, historicalExecutableRole: program ? 'non-auto-discovery .source.txt projection, NOT claimed executed transformed bytes' : 'data/stream projection',
      expandedOriginalGzip: expandedGzip, projectedUtf8Sha256: sha(projected), projectedUtf8Bytes: projected.length,
      encodedTransforms: transformed.encodedTransforms, projectedText: transformed.text };
    records.push(record); originalFiles.push({ path: record.originalPrivateRelativePath, sha256: record.originalPrivateRawSha256, bytes: original.length, projectionScope: scope.label });
    if (/result\.json$/.test(relative)) {
      try { const result = JSON.parse(original); if (result.exitCode !== undefined && result.exitCode !== 0 || result.infrastructureFailure) failures.push({ path: record.originalPrivateRelativePath, originalSha256: sha(original), exitCode: result.exitCode, infrastructureFailure: result.infrastructureFailure ? project(String(result.infrastructureFailure)).text : null }); }
      catch {}
    }
  }
  const expanded = Buffer.from(records.map(record => JSON.stringify(record)).join('\n') + '\n');
  const compressed = zlib.gzipSync(expanded, { level: 9 }), name = scope.label + '.projection.jsonl.gz';
  fs.writeFileSync(path.join(destination, name), compressed, { flag: 'wx' });
  archives.push({ path: 'evidence/public-v1/' + name, sha256: sha(compressed), bytes: compressed.length, expandedSha256: sha(expanded), expandedBytes: expanded.length,
    explicitOriginalPrivateFiles: records.length, originalRawPublished: false, transformedHistoryClaimedExecuted: false });
}
const selected = verifySelection(), production = selected.production.map(relative => {
  const raw = fs.readFileSync(path.join(root, relative)), lf = Buffer.from(raw.toString().replace(/\r\n/g, '\n')), crlf = Buffer.from(lf.toString().replace(/\n/g, '\r\n'));
  return { path: relative, actualWorkingSha256: sha(raw), lfSha256: sha(lf), crlfSha256: sha(crlf), completeProductionExecutable: true };
});
const index = { schema: 'C047-public-projections-and-original-private-bindings/1', mode: 'source-complete private candidate, NOT publication',
  originalAcceptance: 'Enforce preview authorization on every reachable candidate path; unauthorized direct access remains denied.',
  currentProduction: production, completeNewProductionExecutables: selected.production, allActualTestFiles: selected.suites,
  capturedBeforeProjection: completed, archives, originalPrivateFiles: originalFiles, retainedNonzeroExitRecords: failures,
  firstPreflightRawLimitation: 'The first qualification command failed on an incorrect Git-LF assumption. Its exact source preimage and actual tool error are retained, but the original full terminal raw was not captured. No reconstructed raw is claimed.',
  parentOnlyRemainingAuthority: ['live application', 'index', 'ledger', 'publisher', 'independent original acceptance', 'Kano credit'],
  rawHistoryPolicy: 'All original private raw/program bytes stay immutable; these separately hashed projections are NOT original raw or executed transformed history.' };
fs.writeFileSync(path.join(root, 'evidence', 'index.json'), JSON.stringify(index, null, 2) + '\n', { flag: 'wx' });
const privacy = scan(root);
fs.writeFileSync(path.join(capture, 'public-privacy.json'), JSON.stringify(privacy, null, 2) + '\n', { flag: 'wx' });
assert.equal(privacy.findingsFiles, 0, 'EVERY_PUBLIC_FILE_EXPANDED_GZIP_AND_DECODED_BASE64_MUST_BE_PRIVATE_IDENTIFIER_AND_SECRET_FREE');
console.log(JSON.stringify({ actualPublicFiles: privacy.allActualPublicFiles, archives: archives.length, originalPrivateFilesBound: originalFiles.length,
  retainedNonzeroExitRecords: failures.length, privacyFindings: privacy.findingsFiles, sourceCompleteProduction: selected.production, publicationClaimed: false }));
