'use strict';
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), assert = require('node:assert/strict');
const { root, verifySelection } = require('./selection.cjs'), { sha } = require('./privacy.cjs');
function verifyEvidence() {
  const selected = verifySelection(), index = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'index.json')));
  assert.deepEqual(index.completeNewProductionExecutables, selected.production, 'NO_MISSING_COMPLETE_PRODUCTION_SCOPE');
  assert.deepEqual(index.allActualTestFiles, selected.suites, 'NO_HIDDEN_CURRENT_TEST_OMISSION');
  for (const row of index.currentProduction) assert.equal([row.actualWorkingSha256, row.lfSha256, row.crlfSha256].includes(sha(fs.readFileSync(path.join(root, row.path)))), true, 'CURRENT_EXPLICIT_PRODUCTION_FORM:' + row.path);
  const actual = fs.readdirSync(path.join(root, 'evidence', 'public-v1')).sort();
  assert.deepEqual(actual, index.archives.map(row => path.basename(row.path)).sort(), 'EVERY_ACTUAL_PUBLIC_PROJECTION_ACCOUNTED');
  const originalIndex = new Map(index.originalPrivateFiles.map(row => [row.path, row]));
  assert.equal(originalIndex.size, index.originalPrivateFiles.length, 'NO_DUPLICATE_ORIGINAL_PRIVATE_BINDING');
  let actualClosure;
  let originals = 0;
  for (const row of index.archives) {
    const bytes = fs.readFileSync(path.join(root, ...row.path.split('/'))), expanded = zlib.gunzipSync(bytes);
    assert.equal(sha(bytes), row.sha256, 'EXPLICIT_PUBLIC_PROJECTION_BYTES:' + row.path);
    assert.equal(sha(expanded), row.expandedSha256, 'EXPLICIT_EXPANDED_GZIP_BYTES:' + row.path);
    const records = expanded.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
    assert.equal(records.length, row.explicitOriginalPrivateFiles, 'NO_DROPPED_PRIVATE_SOURCE_OR_FAILURE_REFERENCE');
    for (const record of records) {
      assert.equal(sha(Buffer.from(record.projectedText)), record.projectedUtf8Sha256, 'PROJECTION_TEXT_HAS_ITS_OWN_HASH_NOT_ORIGINAL_RAW_HASH');
      const original = originalIndex.get(record.originalPrivateRelativePath);
      assert.ok(original, 'EVERY_RETAINED_RAW_SOURCE_OR_STREAM_IS_REFERENCED');
      assert.equal(original.sha256, record.originalPrivateRawSha256, 'EXACT_ORIGINAL_PRIVATE_RAW_BINDING');
      assert.equal(original.bytes, record.originalPrivateRawBytes, 'EXACT_ORIGINAL_PRIVATE_BYTE_COUNT_BINDING');
      assert.equal(record.schema, 'C047-explicit-portable-projection-NOT-original-raw-or-executed-history/1');
      if (record.originalPrivateRelativePath === 'captures/closure-02/closure.json') actualClosure = JSON.parse(record.projectedText);
    }
    originals += records.length;
  }
  assert.equal(originals, index.originalPrivateFiles.length, 'EVERY_ORIGINAL_PRIVATE_FILE_EXPLICITLY_ACCOUNTED_WITHOUT_DIGEST_EXEMPTIONS');
  assert.ok(actualClosure, 'ACTUAL_COMPLETE_DOMAIN_SOURCE_BOUND_CLOSURE_PROOF_REQUIRED');
  assert.equal(actualClosure.eligibleChangedCompiledPositions, 606);
  assert.equal(actualClosure.totalClosedChangedCompiledPositions, 606);
  assert.equal(actualClosure.stillSemanticUnresolvedCount, 0);
  assert.equal(actualClosure.namedWholeKills, 230);
  assert.equal(actualClosure.localContrasts, 376);
  assert.equal(new Set(actualClosure.exactPositionClosures.map(row => row.id)).size, 606, 'NO_DUPLICATE_POSITION_CREDIT_IN_PORTABLE_PROOF');
  assert.equal(actualClosure.noFaultTimeoutSyntaxIdentityAsKill, true, 'FAULTS_AND_TIMEOUTS_NEVER_BECOME_KILLS');
  assert.equal(actualClosure.resources.groups, 64); assert.equal(actualClosure.resources.complete, 64); assert.equal(actualClosure.resources.actualConcurrency, 8);
  assert.equal(actualClosure.browser.allowed, 20); assert.equal(actualClosure.browser.denied, 22);
  assert.equal(actualClosure.originalFirstPreflightFullRawMissing, true, 'ORIGINAL_EVIDENCE_LIMITATION_NEVER_HIDDEN_OR_RECONSTRUCTED');
  return { completeProductionFiles: selected.production.length, actualCurrentTestFiles: selected.suites.length, publicArchives: index.archives.length, explicitOriginalPrivateFiles: originals,
    originalPrivateFilesystemRequired: false, publishedHeadClaimed: null };
}
if (require.main === module) console.log(JSON.stringify(verifyEvidence()));
module.exports = { verifyEvidence };
