'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');

function build(publication, qualification, automation, browser, manifest, references) {
  assert.equal(publication.cardId, 'X003');
  assert.equal(publication.workerId, 'worker-X003');
  assert.equal(publication.outcome, 'published');
  assert.match(publication.commit, /^[a-f0-9]{40}$/);
  assert.equal(publication.tag, `kanban/X003/${publication.commit.slice(0, 12)}`);
  assert.equal(publication.remoteVerified, true);
  assert.equal(publication.remotePeeledTag, publication.commit);
  assert.equal(qualification.status, 'qualified');
  assert.equal(qualification.commit, publication.commit);
  assert.equal(qualification.tag, publication.tag);
  assert.equal(qualification.remoteAncestryVerified, true);
  assert.equal(qualification.allCommitChangesOwned, true);
  assert.equal(qualification.foreignIndexPreservation.preserved, true);
  assert.equal(publication.foreignIndexPreserved, true);
  assert.equal(automation.failed, 0);
  assert.ok(automation.passed >= 136);
  assert.equal(automation.readOnlyNamespace, true);
  assert.equal(browser.status, 'passed');
  assert.equal(browser.passedChecks, 14);
  assert.equal(browser.practiceNavigations.length, 8);
  assert.equal(browser.returns.length, 10);
  assert.equal(browser.catalogDataSha256, manifest.catalogDataSha256);
  return {
    schema: 'X003/worker-report/1', cardId: 'X003', workerId: 'worker-X003', outcome: 'published',
    commit: publication.commit, tag: publication.tag,
    remoteMain: qualification.remoteMain, remotePeeledTag: qualification.remotePeeledTag, remoteVerified: true,
    kano: 'L', kanoUnit: 'X003', priority: 'P0', packet: 'LP-LEARN', parents: ['H002'],
    technicalEntryGate: ['C005', 'C006', 'C007'], deliver: manifest.deliver,
    originalDelighterCreditRequestedAfterIndependentParentQA: 1, additionalCompanionCredits: 0,
    designatedCompanionsAlreadyAccepted: ['C005', 'C006', 'C007', 'C008', 'A-S001', 'A-S010'],
    parentAcceptancePending: true, sourceCommit: manifest.sourceCommit, catalogDataSha256: manifest.catalogDataSha256,
    sourceEntries: 152, availableHistoricalPortableLessons: 150, unavailableWorkflows: ['W001', 'W002'],
    nativeRunnable: 0, nativeQualified: 0, completedSourceParents: 0, productionNode24Validated: false,
    automated: automation,
    browser: { passedChecks: 14, uniqueActualGoalTargets: 8, actualAppKeyboardReturns: 10,
      nodeVersion: browser.nodeVersion, playwrightVersion: browser.playwrightVersion,
      browserVersion: browser.browserVersion, signature: browser.browserSignature,
      helperRawSha256: browser.helperRawSha256, sourcePin: browser.sourcePin,
      cspObservation: browser.cspObservation, cleanup: browser.browserCleanup },
    ownedBytes: { fileCount: qualification.fileCount, rawIdenticalFiles: qualification.rawIdenticalFiles,
      declaredCanonicalDifferenceFiles: qualification.declaredCanonicalDifferenceFiles,
      committedCompleteRawRecords: qualification.committedCompleteRawProofRecords.length,
      retainedCommittedFailures: qualification.retainedCommittedFailures },
    foreignIndex: qualification.foreignIndexPreservation,
    actualPublisherRawSha256Used: qualification.actualPublisherRawSha256UsedForThisCommit,
    gitTransport: publication.gitTransport, priorGitProcessEnvironmentRestored: publication.priorGitProcessEnvironmentRestored,
    globalGitConfigurationChanged: false, transportIsNotProvenRootCause: true,
    originalAuthorityCaptureIsHistoricalNotForeverCurrent: true,
    references, reportedAtUtc: new Date().toISOString(),
    limits: 'Original local learning X003 only. H002/source parents/native B proof and production Node.js 24 remain incomplete. No profile, AI/service, infrastructure, deployment or spending authority.'
  };
}
function prepare(publicationPath, qualificationPath, automationPath) {
  assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1');
  const load = name => {
    const file = path.resolve(repository, name);
    assert.ok(file.startsWith(`${root}${path.sep}`), 'Only owned report inputs are accepted.');
    return JSON.parse(fs.readFileSync(file));
  };
  const publication = load(publicationPath);
  const qualification = load(qualificationPath);
  const record = load(automationPath);
  assert.equal(record.status, 0);
  const output = zlib.gunzipSync(fs.readFileSync(path.resolve(repository, record.streams.stdout.path)));
  assert.equal(crypto.createHash('sha256').update(output).digest('hex'), record.streams.stdout.sha256);
  const text = output.toString('utf8');
  const count = key => Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text)?.[1]);
  const automation = {
    tests: count('tests'), passed: count('pass'), failed: count('fail'),
    readOnlyNamespace: /READ_ONLY_NAMESPACE unchanged=true/.test(text),
    actualBrowserChecks: /checks=14\/14/.test(text),
    command: 'node capability\\X003\\tests\\verify.cjs', rawRecord: automationPath
  };
  assert.equal(automation.actualBrowserChecks, true);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const report = build(publication, qualification, automation, load(manifest.browserProof), manifest, {
    publicationResult: publicationPath, rawAndGitCanonicalQualification: qualificationPath,
    fullReadOnlyGreen: automationPath, browserProof: manifest.browserProof,
    originalBehavioralRed: manifest.behavioralRedProof, immutableOriginalAuthority: manifest.originalAuthorityCapture
  });
  const directory = path.join(root, 'evidence', 'reports');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `published-${publication.commit.slice(0, 12)}-${crypto.randomUUID()}.json`);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`X003_STATE_REPORT ${path.relative(repository, file)}`);
  return report;
}
module.exports = Object.freeze({ build, prepare });
if (require.main === module) prepare(...process.argv.slice(2));
