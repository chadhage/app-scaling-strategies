'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { root, verifySelection } = require('./selection.cjs'), { list, sha } = require('./privacy.cjs');
const HEAD = 'source-selection-v2.json';
function entries() {
  const selected = verifySelection();
  return list(root).filter(relative => relative !== HEAD).map(relative => {
    const bytes = fs.readFileSync(path.join(root, relative)), textual = /\.(cjs|ps1|md|feature)$/.test(relative), lf = textual ? Buffer.from(bytes.toString().replace(/\r\n/g, '\n')) : bytes,
      crlf = textual ? Buffer.from(lf.toString().replace(/\n/g, '\r\n')) : bytes;
    return { path: relative.replaceAll('\\', '/'), bytes: bytes.length,
      role: selected.production.includes(relative) ? 'complete-new-production-executable' :
        relative.startsWith('tests' + path.sep) || selected.rootTestTooling.includes(relative) ? 'own-test-or-verification-tooling' :
        relative.startsWith('evidence' + path.sep) ? 'explicit-projection-or-evidence-index-NOT-original-raw' :
          /^source-selection.*\.json$/.test(relative) ? 'retained-prior-noncircular-source-head-NOT-current-selection' : 'own-documentation-byte-policy-or-published-input-binding',
      actualWorkingSha256: sha(bytes), filteredGitSha256: sha(lf), qualifiedLfSha256: sha(lf), qualifiedCrlfSha256: sha(crlf),
      bytePolicy: textual ? 'text eol=lf; explicitly qualified fresh LF/CRLF executable forms' : 'raw -text; no normalization permitted' };
  });
}
function seal() {
  assert.equal(fs.existsSync(path.join(root, HEAD)), false, 'CURRENT_SOURCE_HEAD_IS_APPEND_ONCE_NEVER_REPINNED');
  const files = entries(), selected = verifySelection();
  const head = { schema: 'C047-explicit-every-file-source-selection-head/1', cardId: 'C047', originalKanoUnit: 'C047', frozenClass: 'D',
    originalAcceptance: 'Enforce preview authorization on every reachable candidate path; unauthorized direct access remains denied.',
    sourcePublication: null, privateTransportFixtureIsNotPublication: true, completeProductionExecutables: selected.production, allActualTestFiles: selected.suites,
    actualFilesIncludingThisHead: files.length + 1, files,
    thisHead: { path: HEAD, role: 'noncircular source-selection head', bytePolicy: 'raw -text',
      ownByteHashAuthority: 'exact external private source-freeze.json and parent result; later actual parent-owned Git blob/newHEAD, never a self-authenticating internal digest exemption' },
    allRetainedFailedAttempts: 'explicit evidence/index.json pre-projection history plus every actual later private source/result/stream binding in the external final source-freeze and parent result; no missing-private-files requirement for ordinary public verification',
    claimedAcceptanceOrKanoCredit: false };
  fs.writeFileSync(path.join(root, HEAD), JSON.stringify(head, null, 2) + '\n', { flag: 'wx' });
  return { headSha256: sha(fs.readFileSync(path.join(root, HEAD))), actualFilesIncludingHead: files.length + 1 };
}
function verifyPublicSeal() {
  const headBytes = fs.readFileSync(path.join(root, HEAD)), head = JSON.parse(headBytes), actual = list(root).map(relative => relative.replaceAll('\\', '/')).sort();
  assert.equal(head.schema, 'C047-explicit-every-file-source-selection-head/1');
  assert.equal(head.thisHead.path, HEAD, 'EXPLICIT_HEAD_ACCOUNTED_BY_EXTERNAL_NONCIRCULAR_ANCHOR');
  assert.equal(head.thisHead.bytePolicy, 'raw -text');
  assert.deepEqual(actual, [...head.files.map(row => row.path), HEAD].sort(), 'EVERY_ACTUAL_NAMESPACE_FILE_ACCOUNTED_NO_BLANKET_EVIDENCE_OR_DIGEST_EXCLUSION');
  assert.equal(actual.length, head.actualFilesIncludingThisHead, 'CURRENT_COMPLETE_NAMESPACE_FILE_DENOMINATOR');
  const selected = verifySelection();
  assert.deepEqual(head.completeProductionExecutables, selected.production); assert.deepEqual(head.allActualTestFiles, selected.suites);
  for (const row of head.files) {
    const bytes = fs.readFileSync(path.join(root, ...row.path.split('/'))), digest = sha(bytes), textual = row.bytePolicy.startsWith('text eol=lf');
    assert.equal([row.actualWorkingSha256, row.filteredGitSha256, row.qualifiedLfSha256, row.qualifiedCrlfSha256].includes(digest), true, 'EXACT_EXPLICIT_CURRENT_WORKING_GIT_LF_OR_CRLF_FILE:' + row.path);
    if (textual) {
      const lf = Buffer.from(bytes.toString().replace(/\r\n/g, '\n')), crlf = Buffer.from(lf.toString().replace(/\n/g, '\r\n'));
      assert.equal(sha(lf), row.qualifiedLfSha256, 'EVERY_DECLARED_LF_DIGEST_IS_CHECKED:' + row.path);
      assert.equal(sha(lf), row.filteredGitSha256, 'EVERY_DECLARED_FILTERED_GIT_DIGEST_IS_CHECKED:' + row.path);
      assert.equal(sha(crlf), row.qualifiedCrlfSha256, 'EVERY_DECLARED_CRLF_DIGEST_IS_CHECKED:' + row.path);
      assert.equal([sha(lf), sha(crlf)].includes(row.actualWorkingSha256), true, 'RAW_WORKING_DIGEST_HAS_AN_EXPLICIT_QUALIFIED_FORM:' + row.path);
    } else for (const key of ['actualWorkingSha256', 'filteredGitSha256', 'qualifiedLfSha256', 'qualifiedCrlfSha256']) assert.equal(row[key], digest, 'EVERY_RAW_DATA_DIGEST_STAYS_EXACT:' + row.path + ':' + key);
  }
  return { actualFilesIncludingHead: actual.length, headSha256: sha(headBytes), internalSelfAuthenticationClaimed: false,
    externalHeadAuthorityRequired: true, everyOtherActualFileDigestVerified: head.files.length, publicationClaimed: null };
}
if (require.main === module) console.log(JSON.stringify(process.argv[2] === 'create' ? seal() : verifyPublicSeal()));
module.exports = { seal, verifyPublicSeal };
