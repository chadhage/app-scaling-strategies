'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const owned = path.resolve(__dirname, '..');
const root = path.resolve(owned, '..', '..');
const read = relative => fs.readFileSync(path.join(owned, relative));
const json = relative => JSON.parse(read(relative).toString('utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const normalize = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const git = args => execFileSync('git', ['--no-pager', ...args], { cwd: root, maxBuffer: 2000000 });
const gitPath = relative => relative.replace(/\\/g, '/');

function filesBelow(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    assert.equal(entry.isSymbolicLink(), false, 'Owned evidence may not redirect to unowned paths');
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? filesBelow(path.join(directory, entry.name), relative) : [relative];
  });
}

test('owned inventory preserves raw bytes and qualifies canonical LF text without writing', () => {
  const manifest = json('evidence\\integrity.json');
  assert.equal(manifest.cardId, 'A-S094');
  assert.equal(manifest.kanoUnit, 'A-S094');
  assert.equal(manifest.rawPolicy, 'raw-bytes');
  assert.equal(manifest.textPolicy, 'canonical-lf');
  const actual = filesBelow(owned).filter(file => file !== 'evidence\\integrity.json').sort();
  assert.deepEqual(manifest.files.map(file => file.path).sort(), actual);
  for (const item of manifest.files) {
    assert.equal(path.isAbsolute(item.path), false);
    assert.ok(!item.path.split(/[\\/]/).includes('..'));
    const expectedMode = item.path.startsWith('evidence\\raw\\') ? 'raw-bytes' : 'canonical-lf';
    assert.equal(item.mode, expectedMode);
    const bytes = read(item.path);
    assert.equal(sha(item.mode === 'raw-bytes' ? bytes : normalize(bytes)), item.sha256, item.path);
  }
  assert.equal(normalize(read('.gitattributes')).toString('utf8').trim(), 'evidence/raw/** -text -diff');
  const attributes = git(['check-attr', 'text', 'diff', '--',
    'learning\\S094\\evidence\\raw\\source\\readme.working.snapshot',
    'learning\\S094\\evidence\\raw\\red\\stdout.tap']).toString('utf8');
  assert.equal(attributes.trim().split(/\r?\n/).length, 4);
  assert.ok(attributes.trim().split(/\r?\n/).every(line => /: (?:text|diff): unset$/.test(line)));
});

test('immutable source Git objects and exact S094/card/packet scopes match preserved provenance', () => {
  const provenance = json('evidence\\raw\\source\\provenance.json');
  assert.match(provenance.sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(provenance.cardId, 'A-S094');
  assert.equal(provenance.parentId, 'D-S094');
  assert.equal(provenance.packet, 'SC-S094');
  assert.equal(provenance.kano, 'S');
  assert.equal(provenance.qualifiedScopes.length, 5);
  const texts = {};
  for (const source of provenance.sources) {
    const canonical = read(`evidence\\raw\\source\\${source.canonicalSnapshot}`);
    const working = read(`evidence\\raw\\source\\${source.workingSnapshot}`);
    assert.equal(sha(canonical), source.canonicalSha256);
    assert.equal(sha(working), source.workingSha256);
    assert.ok(canonical.equals(git(['show', `${provenance.sourceCommit}:${gitPath(source.source)}`])));
    assert.equal((working.toString('utf8').match(/\r\n/g) || []).length, source.workingCRLF);
    assert.ok(source.workingCRLF > 0, 'Original Windows source CRLF must remain raw');
    assert.equal(normalize(working).equals(normalize(canonical)), source.wholeFileEquivalentAfterCRLFNormalization);
    texts[source.source] = { working: normalize(working).toString('utf8'), git: normalize(canonical).toString('utf8') };
  }
  const row = (text, id) => text.split('\n').find(line => line.startsWith(`| ${id} |`));
  const selectors = [
    ['S094 README row', 'README.md', text => row(text, 'S094')],
    ['D-S094 backlog row', '.docs\\wiki\\backlog.md', text => row(text, 'D-S094')],
    ['A-S094 card row', '.docs\\wiki\\kanban.md', text => row(text, 'A-S094')],
    ['Atomic and portable A contract', '.docs\\wiki\\kanban.md', text => text.split('## Atomic card contract\n')[1].split('## Concurrent pull and one-piece flow')[0]],
    ['SC-S094 default packet rule', '.docs\\wiki\\kanban.md', text => text.split('\n').find(line => line.startsWith('Packet membership is fixed before admission.'))],
  ];
  selectors.forEach(([name, source, select], index) => {
    const scope = provenance.qualifiedScopes[index];
    assert.equal(scope.name, name);
    const canonical = select(texts[source].git);
    assert.equal(select(texts[source].working), canonical);
    assert.equal(sha(canonical), scope.canonicalSha256);
    assert.equal(scope.exactWorkingAndGitScopeEquivalent, true);
  });
  assert.match(row(texts['README.md'].git, 'S094'), /Detect login\/session failures before expanding the affected cohort\./);
  assert.match(row(texts['.docs\\wiki\\backlog.md'].git, 'D-S094'), /Authentication failures stop expansion without bypassing validation; affected users remain counted\./);
  const card = json('evidence\\raw\\source\\card.inventory.snapshot');
  assert.equal(card.deliver, 'Break candidate authentication; detect forced reauthentication or rejected valid sessions.');
  assert.equal(card.id, 'A-S094');
  assert.equal(card.packet, 'SC-S094');
  assert.equal(card.technicalEntryGate, 'SOURCE');
});

test('retained RED is loadable actual assertion failure; IaC N/A follows it', () => {
  const red = json('evidence\\raw\\red\\result.json');
  const stdout = read('evidence\\raw\\red\\stdout.tap');
  const stderr = read('evidence\\raw\\red\\stderr.log');
  assert.equal(red.exitCode, 1);
  assert.equal(red.assertionCode, 'ERR_ASSERTION');
  assert.equal(red.actual, 'UNKNOWN');
  assert.equal(red.expected, 'FAILURE');
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(sha(stdout), red.stdoutSha256);
  assert.equal(sha(stderr), red.stderrSha256);
  assert.match(stdout.toString('utf8'), /code: 'ERR_ASSERTION'/);
  const module = { exports: {} };
  vm.runInNewContext(read('evidence\\raw\\red\\model.js.snapshot').toString('utf8'), { module }, { timeout: 1000 });
  const stub = module.exports;
  let state = stub.createState();
  state = stub.transition(state, { type: 'start', fixtureId: 'forced-reauthentication', pilot: 2 });
  state = stub.transition(state, { type: 'observe' });
  state = stub.transition(state, { type: 'expand' });
  assert.throws(() => assert.equal(state.result.outcome, 'FAILURE'), { code: 'ERR_ASSERTION' });
  const originalTest = normalize(read('evidence\\raw\\red\\model.test.cjs.snapshot')).toString('utf8');
  assert.ok(normalize(read('tests\\model.test.cjs')).toString('utf8').startsWith(originalTest));
  assert.ok(normalize(read('authentication.feature')).equals(normalize(read('evidence\\raw\\red\\authentication.feature.snapshot'))));
  assert.ok(filesBelow(path.join(owned, 'evidence', 'raw')).every(file => !/\.(?:test|spec)\.(?:js|cjs|mjs)$/.test(file)));
  const iac = json('evidence\\iac.json');
  assert.equal(iac.applicability, 'N/A');
  assert.equal(iac.afterGenuineRed, true);
  assert.equal(iac.redResultSha256, sha(read('evidence\\raw\\red\\result.json')));
  assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.capturedAtUtc));
});

test('manifest, static local surface and CSP make only the exact synthetic A-card claim', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.cardId, 'A-S094');
  assert.equal(manifest.workerId, 'worker-A-S094');
  assert.equal(manifest.sourceId, 'S094');
  assert.equal(manifest.parentId, 'D-S094');
  assert.equal(manifest.siblingId, 'B-S094');
  assert.equal(manifest.packet, 'SC-S094');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S094');
  assert.equal(manifest.objective, 'Break candidate authentication; detect forced reauthentication or rejected valid sessions.');
  assert.equal(manifest.managementCalls, false);
  assert.equal(manifest.credentials, false);
  assert.equal(manifest.nativeAcceptanceCompleted, false);
  const html = read('index.html').toString('utf8');
  assert.ok(html.includes(manifest.banner));
  assert.ok(!/\son[a-z]+\s*=/i.test(html));
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html));
  assert.ok(!/\b(?:id|name)=["']reset["']/i.test(html));
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "form-action 'none'", "object-src 'none'", "base-uri 'none'",
    "frame-src 'none'", "worker-src 'none'"]) assert.ok(csp.split('; ').includes(directive));
  const application = read('model.js').toString('utf8') + read('app.js').toString('utf8');
  assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\b/.test(application));
  assert.ok(!/\b(?:innerHTML|document\.cookie|navigator\.credentials)\b/.test(application));
  assert.match(application, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
});

test('retained actual browser evidence is from the sole qualified offline helper and cleaned session', () => {
  const browser = json('evidence\\raw\\browser\\run.json');
  const expected = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
  const helper = fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(sha(helper), expected);
  const publishedHelper = git(['show', '53c0c0d82cc1db6780a87ac2b1085734af6d5c60:testing/browser/isolated.cjs']);
  assert.ok(normalize(helper).equals(publishedHelper), 'Raw CRLF helper must match the published canonical LF Git object');
  assert.equal(browser.helperSha256, expected);
  assert.equal(browser.helperPublishedCommit, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
  assert.equal(browser.captureBrowserEvidence, true);
  assert.equal(browser.verifierResult, 'passed');
  assert.equal(browser.unitCount, 1);
  assert.match(browser.runtime, /^v22\./);
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.browserVersion, /^156\./);
  assert.deepEqual(browser.userImpactResults, ['SUCCESS', 'FAILURE', 'UNKNOWN']);
  assert.equal(browser.actualAuthenticationCertified, false);
  assert.equal(browser.nativeAzureCertified, false);
  assert.equal(browser.productionNode24Certified, false);
  assert.equal(browser.cleanup.awaitedFinallyClose, true);
  assert.equal(browser.cleanup.closed, true);
  assert.equal(browser.cleanup.localHistoryCleared, true);
  assert.deepEqual(browser.httpRequests, []);
  assert.deepEqual(browser.pageErrors, []);
  assert.ok(browser.checks.length >= 11);
  for (const directive of ['script-src-elem', 'connect-src', 'form-action']) {
    assert.ok(browser.csp.violations.some(item => item.directive === directive && item.disposition === 'enforce'));
  }
  for (const artifact of browser.artifacts) {
    assert.equal(sha(read(`evidence\\raw\\browser\\${artifact.file}`)), artifact.sha256);
  }
  const signature = json('evidence\\raw\\tooling\\edge-signature.json');
  assert.equal(signature.status, 'Valid');
  assert.match(signature.signerSubject, /Microsoft Corporation/);
  assert.match(signature.fileVersion, /^156\./);
});
