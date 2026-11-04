'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const publisher = require('..\\publisher-policy.cjs');
const root = path.resolve(__dirname, '..');
const history = require('..\\publisher-history.json');
const historical = JSON.parse(fs.readFileSync(path.join(root, history.directory, 'approval.historical.json'), 'utf8'));
const topKeys = ['id', 'approvedBy', 'publisherSha256', 'focusedGuardChecksPassed', 'mainMustEqualRemoteBeforeStaging',
  'namespaceAndFrozenClassGuardsUnchanged', 'syntaxPassed', 'originalKanoCredit', 'cloudAuthorityExpanded'];
const revisionKeys = ['publisherSha256', 'previousPublisherSha256', 'focusedGuardChecksPassed', 'extraCredits',
  'cloudIdentityOrInfrastructureAuthorityExpanded', 'ownedNamespaces', 'exactAddedClasses', 'approvedBy',
  'onlyFourExactClassTokensChanged', 'namespaceFrozenClassAdminHeadWhitespaceAndTransportRulesUnchanged'];
function fixture() {
  const approval = Object.fromEntries(topKeys.map((key) => [key, historical.approval[key]]));
  approval.classificationAndInspectionRevision = Object.fromEntries(revisionKeys.map((key) =>
    [key, structuredClone(historical.approval.classificationAndInspectionRevision[key])]));
  return approval;
}
test('historical fixture has approved 61-guard hash; normal tests never read live private bytes', () => {
  assert.equal(history.historicalOnly, true);
  assert.equal(historical.readUnderStateMutex, true);
  assert.equal(historical.handlesClosedBeforePublisher, true);
  const bytes = fs.readFileSync(path.join(root, history.directory, 'publisher.ps1.snapshot'));
  const checked = publisher.verifyHistoricalBytes(bytes);
  assert.equal(checked.exactFourTokensOnly, true);
  assert.equal(checked.historicalPredecessorHash, '60ae100b96622c8ca828d7db2f8000780476e7c7411a9f3d26f0959fd182aeea');
  assert.equal(checked.normalTestReadsLivePrivatePublisher, false);
  assert.equal(publisher.authorize(JSON.stringify(fixture())).guardChecks, 61);
});
for (const [field, value] of [
  ['id', 'unknown'], ['approvedBy', 'worker-C030'], ['publisherSha256', '0'.repeat(64)],
  ['focusedGuardChecksPassed', 60], ['mainMustEqualRemoteBeforeStaging', false],
  ['namespaceAndFrozenClassGuardsUnchanged', 'true'], ['syntaxPassed', 1], ['originalKanoCredit', 1],
  ['cloudAuthorityExpanded', true], ['ownClass', 'S'], ['ownedNamespace', 'capability\\C035'],
  ['workerId', 'worker-C035']
]) {
  test(`publication denies changed top ${field} before staging`, () => {
    const approval = fixture(); approval[field] = value;
    assert.throws(() => publisher.authorize(JSON.stringify(approval)));
  });
}
for (const [field, value] of [
  ['publisherSha256', 'f'.repeat(64)], ['previousPublisherSha256', '0'.repeat(64)], ['focusedGuardChecksPassed', '61'],
  ['extraCredits', 1], ['cloudIdentityOrInfrastructureAuthorityExpanded', true], ['approvedBy', 'self'],
  ['onlyFourExactClassTokensChanged', false], ['namespaceFrozenClassAdminHeadWhitespaceAndTransportRulesUnchanged', false],
  ['ownedNamespaces', ['capability\\C030', 'capability\\C035', 'capability\\C037', '..\\C038']]
]) {
  test(`publication denies changed current revision ${field}`, () => {
    const approval = fixture(); approval.classificationAndInspectionRevision[field] = value;
    assert.throws(() => publisher.authorize(JSON.stringify(approval)));
  });
}
for (const [card, value] of [['C030', 'S'], ['C035', 'S'], ['C037', 'D'], ['C038', 'D'], ['C099', 'S']]) {
  test(`publication denies class-map alteration ${card}/${value}`, () => {
    const approval = fixture(); approval.classificationAndInspectionRevision.exactAddedClasses[card] = value;
    assert.throws(() => publisher.authorize(JSON.stringify(approval)));
  });
}
test('historical private-byte mutation and removed current authorization cannot become permission', () => {
  const bytes = fs.readFileSync(path.join(root, history.directory, 'publisher.ps1.snapshot'));
  bytes[0] ^= 1;
  assert.throws(() => publisher.verifyHistoricalBytes(bytes), /UNRECOGNIZED_HISTORICAL_PUBLISHER/);
  const approval = fixture(); delete approval.classificationAndInspectionRevision;
  assert.throws(() => publisher.authorize(JSON.stringify(approval)));
  assert.throws(() => publisher.authorize(JSON.stringify(fixture()), { eligible: true }));
});
test('no historical nested revision is required or usable as current authority', () => {
  const approval = fixture();
  assert.equal(Object.hasOwn(approval, 'budgetAndGoalRevision'), false);
  assert.equal(publisher.authorize(JSON.stringify(approval)).allowed, true);
  approval.publisherSha256 = '60ae100b96622c8ca828d7db2f8000780476e7c7411a9f3d26f0959fd182aeea';
  assert.throws(() => publisher.authorize(JSON.stringify(approval)));
});
test('process-local HTTP/1.1 preserves provider presence and values on success and failure', () => {
  const output = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'transport.test.ps1')], {
    cwd: path.resolve(root, '..', '..'), timeout: 60000, windowsHide: true, encoding: 'utf8'
  });
  assert.equal(output.status, 0, output.stderr);
  const proof = JSON.parse(output.stdout);
  assert.equal(proof.checks, 4);
  assert.equal(proof.restoration, true);
  assert.equal(proof.freshSafeGitRead, true);
  assert.equal(proof.noPrivatePublisherRead, true);
});
test('foreign index debug parser preserves exact flags, including paths containing newlines', () => {
  const { parseDebug } = require('.\\index-snapshot.cjs');
  const metadata = (flags) => `  ctime: 1:2\n  mtime: 1:2\n  dev: 1\tino: 2\n  uid: 3\tgid: 4\n  size: 5\tflags: ${flags}\n`;
  const bytes = Buffer.from(`capability/C048/example\0${metadata('0')}another\npath\0${metadata('40004000')}`);
  const parsed = parseDebug(bytes);
  assert.equal(parsed.get('capability/C048/example'), '0');
  assert.equal(parsed.get('another\npath'), '40004000');
  assert.equal(parsed.size, 2);
  assert.throws(() => parseDebug(Buffer.from('truncated')));
});
test('publication reads current canonical authority under State, releases it before Publisher and checks HEAD before delegation', () => {
  const script = fs.readFileSync(path.join(root, 'publish.ps1'), 'utf8');
  assert.ok(script.indexOf('$stateMutex.ReleaseMutex()') < script.indexOf('$publisherMutex.WaitOne'));
  assert.ok(script.indexOf('$ledger.localPublisherAuthorization') < script.indexOf('$publisherMutex.WaitOne'));
  assert.ok(script.indexOf('Actual HEAD must equal actual remote main') < script.indexOf("-CardId C030 -WorkerId worker-C030 -Paths @('capability\\C030')"));
  assert.match(script, /\$card\[0\]\.owner -cne 'worker-C030'/);
  assert.match(script, /\$card\[0\]\.kano -cne 'D'/);
  assert.match(script, /Current exact original claimed owner\/class\/path/);
  assert.match(script, /Actual CURRENT private bytes disagree with CURRENT canonical approved hash/);
  assert.doesNotMatch(script.slice(script.indexOf('$publisherMutex.WaitOne')), /readGates\(|preflight\(|state\.ps1/);
});
test('under-Publisher raw/canonical verifier has no direct or indirect State acquisition', () => {
  const verifier = fs.readFileSync(path.join(__dirname, 'publication-proof.cjs'), 'utf8');
  assert.match(verifier, /\.checkImports\(\)/);
  assert.doesNotMatch(verifier, /\.readGates\(|\.preflight\(|state\.ps1|verify\.cjs|browser\.cjs/);
  const capture = fs.readFileSync(path.join(__dirname, 'publish.cjs'), 'utf8');
  assert.ok(capture.indexOf('const output = spawnSync') < capture.indexOf("'-Action', 'Report'"));
  assert.doesNotMatch(capture, /'-Action', 'Accept'/);
});
test('HTTP transport restoration never substitutes null for absent provider entries or changes TLS/proxy/auth', () => {
  const transport = fs.readFileSync(path.join(root, 'transport.ps1'), 'utf8');
  assert.match(transport, /else \{ Remove-Item -LiteralPath "Env:/);
  assert.doesNotMatch(transport, /SetEnvironmentVariable|Set-Item[^\n]*\$null|http\.ssl|http\.proxy|credential\.|--global/);
  assert.ok(transport.indexOf('Assert-C030ConfigEnvironment $before') < transport.indexOf('git --no-pager rev-parse --verify HEAD'));
});
