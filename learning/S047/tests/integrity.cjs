'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const owned = path.resolve(__dirname, '..');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const local = (relative) => {
  const result = path.resolve(owned, ...relative.split('/'));
  assert.ok(result.startsWith(owned + path.sep), `Out-of-scope evidence reference: ${relative}`);
  return result;
};
const bytes = (relative) => fs.readFileSync(local(relative));
const read = (relative) => JSON.parse(bytes(relative));
const summary = read('evidence.json');
assert.match(summary.contentSeal, /^evidence\/content-hashes(?:-\d{3})?\.json$/);
const seal = read(summary.contentSeal);
const checks = [];
function check(name, action) { action(); checks.push(name); }
function files(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? files(path.join(directory, entry.name), relative) : [relative];
  });
}
const afterSeal = (relative) => relative === summary.contentSeal
  || /^evidence\/integrity(?:-\d{3})?\.(?:raw\.json|stdout\.txt|stderr\.txt)$/.test(relative);

check('all owned source and historical proof bytes match the explicit content seal', () => {
  assert.equal(seal.cardId, 'A-S047');
  const actual = files(owned).filter((relative) => !afterSeal(relative)).sort();
  assert.deepEqual(actual, Object.keys(seal.files).sort());
  for (const [relative, expected] of Object.entries(seal.files)) {
    const content = bytes(relative);
    assert.equal(content.length, expected.bytes, relative);
    assert.equal(sha256(content), expected.sha256, relative);
  }
});

check('every captured command retains its actual exits, stdout/stderr bytes and hashes', () => {
  for (const relative of files(owned).filter((name) => /^evidence\/.+\.raw\.json$/.test(name))) {
    const raw = read(relative);
    assert.equal(raw.cardId, 'A-S047');
    assert.equal(raw.workerId, 'worker-A-S047');
    assert.equal(raw.runtime.node, 'v22.23.4');
    assert.equal(raw.command.executable, process.execPath);
    assert.ok(Date.parse(raw.startedAtUtc) <= Date.parse(raw.finishedAtUtc));
    for (const stream of ['stdout', 'stderr']) {
      const content = bytes(`evidence/${raw[stream].path}`);
      assert.equal(content.length, raw[stream].bytes, relative);
      assert.equal(sha256(content), raw[stream].sha256, relative);
    }
  }
  const guard = read('evidence/publication-check.json');
  assert.equal(guard.actualExit, 2);
  assert.equal(guard.signal, null);
  assert.deepEqual(guard.command.arguments.slice(0, 5), ['--no-pager', 'diff', '--cached', '--check', '--']);
  assert.equal(guard.sourceAttributesSha256, sha256(bytes('evidence/publication-guard-red/attributes.source.snapshot')));
  for (const stream of ['stdout', 'stderr']) {
    const content = bytes(`evidence/${guard[stream].path}`);
    assert.equal(content.length, guard[stream].bytes);
    assert.equal(sha256(content), guard[stream].sha256);
  }
  assert.match(bytes('evidence/publication-check.stdout.txt').toString('utf8'), /iac-na\.json:1: trailing whitespace/);
});

check('loadable stub and genuine checkpoint RED are frozen and replayable, never auto-discovered', () => {
  const stub = read('evidence/stub-load.raw.json');
  const red = read('evidence/red.raw.json');
  assert.equal(stub.actualExit, 0);
  assert.equal(JSON.parse(bytes('evidence/stub-load.stdout.txt')).loadable, true);
  assert.equal(red.actualExit, 1);
  assert.equal(red.error, null);
  assert.equal(red.signal, null);
  const output = bytes('evidence/red.stdout.txt').toString('utf8');
  assert.match(output, /ERR_ASSERTION/);
  assert.match(output, /1 !== 4/);
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|Cannot find module|ENOENT/);
  for (const [relative, expected] of Object.entries(red.snapshotHashes)) {
    assert.ok(relative.endsWith('.snapshot'));
    assert.equal(sha256(bytes(`evidence/${relative}`)), expected, relative);
  }
  assert.equal(red.sourceHashes['stream.js'], sha256(bytes('evidence/red/stream.source.snapshot')));
  const firstBrowser = read('evidence/browser.raw.json');
  assert.equal(firstBrowser.actualExit, 1);
  assert.equal(firstBrowser.sourceHashes['tests/browser.cjs'], sha256(bytes('evidence/csp-probe-red/browser.source.snapshot')));
  const retainedBrowserFailure = read('evidence/browser.json');
  assert.equal(retainedBrowserFailure.verifier, 'FAIL');
  assert.equal(retainedBrowserFailure.cleanup.status, 'PASS');
  assert.equal(retainedBrowserFailure.checks.filter((item) => item.status === 'PASS').length, 14);
  const replay = spawnSync(process.execPath, [path.join(__dirname, 'replay-red.cjs')], { encoding: 'utf8' });
  assert.equal(replay.status, 1);
  assert.equal(replay.signal, null);
  assert.match(replay.stdout, /ERR_ASSERTION/);
  assert.match(replay.stdout, /1 !== 4/);
});

check('BDD, stub, behavioral RED and resource-free IaC decision retain their actual order', () => {
  const bdd = read('evidence/bdd.raw.json');
  const stub = read('evidence/stub-load.raw.json');
  const red = read('evidence/red.raw.json');
  const iac = read('evidence/iac-na.json');
  const green = read(`evidence/${summary.finalStages.green}.raw.json`);
  assert.ok(Date.parse(bdd.finishedAtUtc) <= Date.parse(stub.startedAtUtc));
  assert.ok(Date.parse(stub.finishedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(iac.recordedAtUtc));
  assert.ok(Date.parse(iac.recordedAtUtc) <= Date.parse(green.startedAtUtc));
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.verifiedStubSha256, red.snapshotHashes['red/stream.source.snapshot']);
  assert.equal(iac.redRecordSha256, sha256(bytes('evidence/red.raw.json')));
  const contract = read('evidence/source-contract.json');
  assert.equal(contract.packet.id, 'SC-S047');
  assert.equal(contract.packet.kano, 'S');
  assert.match(contract.source.line, /application-level continuation/);
  assert.match(contract.parent.line, /Native HTTP\/2\/gRPC continuation is verified separately/);
  assert.match(contract.card.line, /do not treat ordinary HTTP as streaming proof/);
  assert.match(contract.portableContract, /Training rehearsal - synthetic data - not a live Azure result/);
});

check('final green, syntax, tooling and browser captures attest the exact current source files', () => {
  const currentSources = files(owned).filter((relative) => !relative.startsWith('evidence/') && relative !== 'evidence.json').sort();
  for (const kind of ['green', 'syntax', 'tooling', 'browser']) {
    const raw = read(`evidence/${summary.finalStages[kind]}.raw.json`);
    assert.equal(raw.actualExit, 0, kind);
    assert.equal(raw.signal, null, kind);
    assert.equal(raw.error, null, kind);
    assert.deepEqual(Object.keys(raw.sourceHashes).sort(), currentSources, kind);
    for (const relative of currentSources) assert.equal(raw.sourceHashes[relative], sha256(bytes(relative)), `${kind}: ${relative}`);
  }
  const green = bytes(`evidence/${summary.finalStages.green}.stdout.txt`).toString('utf8');
  assert.equal(Number(green.match(/^# tests (\d+)$/m)[1]), summary.automatedTests);
  assert.equal(Number(green.match(/^# fail (\d+)$/m)[1]), 0);
});

check('actual browser and signed offline tooling evidence have no native or production claim', () => {
  const browser = read(`evidence/${summary.browserReceipt}`);
  const rawBrowser = read(`evidence/${summary.finalStages.browser}.raw.json`);
  assert.equal(rawBrowser.environment.CAPTURE_BROWSER_EVIDENCE, '1');
  assert.deepEqual(JSON.parse(bytes(`evidence/${rawBrowser.stdout.path}`)), browser);
  assert.equal(browser.verifier, 'PASS');
  assert.equal(browser.nativeProof, 'not performed');
  assert.equal(browser.cleanup.awaitedFinally, true);
  assert.equal(browser.cleanup.status, 'PASS');
  assert.equal(browser.checks.length, summary.browserCheckGroups);
  assert.ok(browser.checks.every((item) => item.status === 'PASS'));
  assert.deepEqual(browser.externalRequests, []);
  assert.deepEqual(browser.pageErrors, []);
  const csp = browser.checks.find((item) => item.name.startsWith('enforced CSP')).observed;
  assert.equal(csp.inlineRan, false);
  assert.equal(csp.evalBlocked, true);
  assert.equal(csp.connectBlocked, true);
  const toolingRaw = read(`evidence/${summary.finalStages.tooling}.raw.json`);
  const tooling = JSON.parse(bytes(`evidence/${toolingRaw.stdout.path}`));
  assert.equal(tooling.playwrightVersion, '1.56.1');
  assert.equal(tooling.edge.signatureStatus, 'Valid');
  assert.match(tooling.edge.signer, /^CN=Microsoft Corporation,/);
  assert.equal(tooling.edge.version, browser.browserVersion);
  assert.equal(tooling.helperSha256, browser.helperSha256);
  assert.equal(tooling.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(summary.nativeProof, 'not performed');
  assert.equal(summary.productionNode24Certified, false);
  assert.equal(summary.sourceParentComplete, false);
  assert.equal(summary.earnedUnits, 0);
  assert.equal(summary.acceptance, 'Pending parent empirical acceptance; worker does not Accept.');
});

console.log(JSON.stringify({ verifier: 'PASS', sealedFiles: Object.keys(seal.files).length, integrityCheckGroups: checks.length, checks, frozenRedReplayExit: 1 }, null, 2));
