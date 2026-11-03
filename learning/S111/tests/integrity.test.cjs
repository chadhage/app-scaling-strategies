'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const { sha256, captureEnabled, ownedSnapshot } = require(path.join(root, 'tools', 'proof.cjs'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

test('manifest binds the exact source behavior, source acceptance and one frozen portable unit', () => {
  const source = fs.readFileSync(path.join(repo, 'README.md'), 'utf8').split(/\r?\n/).find(line => /^\| S111 \|/.test(line));
  const backlog = fs.readFileSync(path.join(repo, '.docs', 'wiki', 'backlog.md'), 'utf8').split(/\r?\n/).find(line => /^\| D-S111 \|/.test(line));
  assert.equal(manifest.sourceRequiredBehavior, source.split('|')[2].trim().replace(/\*\*/g, ''));
  assert.equal(manifest.sourceAcceptance, backlog.split('|')[4].trim());
  assert.equal(manifest.objective, 'Lose one worker; distinguish application-worker, node, zone, and region failures.');
  assert.equal(manifest.cardId, 'A-S111');
  assert.equal(manifest.sourceId, 'S111');
  assert.deepEqual(manifest.parentIds, ['D-S111']);
  assert.equal(manifest.packet, 'SC-S111');
  assert.equal(manifest.kanoUnit, 'A-S111');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.owner, 'worker-A-S111');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.additionalKanoCredits, 0);
  assert.match(manifest.sourceQualification, /fixed fictional teaching DATA ONLY/);
  assert.match(manifest.iac, /^N\/A/);
});

test('BDD and raw genuine assertion RED remain bound to the original loadable stub and test bytes', () => {
  const red = JSON.parse(read(path.join('evidence', 'red.json')));
  assert.equal(red.beforeImplementation, true);
  assert.equal(red.stubSyntaxExitCode, 0);
  assert.equal(red.exitCode, 1);
  assert.equal(red.failed, 4);
  assert.equal(red.failureCode, 'ERR_ASSERTION');
  assert.equal(sha256(fs.readFileSync(path.join(root, 'evidence', red.stubPath))), red.stubSha256);
  const bdd = fs.readFileSync(path.join(root, 'evidence', red.bddSnapshot));
  assert.equal(sha256(bdd), red.bddSha256);
  assert.equal(bdd.toString('utf8').replace(/\r\n/g, '\n'), read('lesson.feature'));
  assert.equal(sha256(fs.readFileSync(path.join(root, 'evidence', red.assertionSnapshot))), red.assertionSnapshotSha256);
  const tap = fs.readFileSync(path.join(root, 'evidence', red.rawOutput));
  assert.equal(sha256(tap), red.rawOutputSha256);
  assert.match(tap.toString(), /actual: 'ready'/);
  assert.match(tap.toString(), /expected: 'baseline'/);
  assert.match(tap.toString(), /# fail 4/);
  assert.doesNotMatch(tap.toString(), /MODULE_NOT_FOUND|SyntaxError|ERR_MODULE/);
  const iac = JSON.parse(read(path.join('evidence', 'iac.json')));
  assert.equal(iac.applicability, 'N/A');
  assert.equal(iac.processTermination, false);
  assert.equal(iac.infrastructureGenerated, false);
});

test('standalone browser assets have exact banner, guarded controls and restrictive CSP', () => {
  const html = read('index.html');
  assert.ok(html.includes(manifest.banner));
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /worker-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /base-uri 'none'/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|on(?:click|submit|load)=|https?:\/\//i);
  assert.match(html, /id="reset-lesson" type="button"/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(read('lesson.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(read('lesson.js'), /innerHTML|\.reset\(\)|fetch\(|localStorage|sessionStorage/);
  for (const file of ['model.js', 'lesson.js', 'lesson.css']) assert.ok(fs.existsSync(path.join(root, file)));
  const application = [html, read('model.js'), read('lesson.js'), read('lesson.css')].join('\n');
  assert.doesNotMatch(application, /XMLHttpRequest|WebSocket|sendBeacon|process\.|child_process|Math\.random|Date\.now|setInterval|setTimeout|https?:\/\//);
  assert.match(html, /A fictional app-worker loss is not an Azure-zone or Azure-region outage experiment/);
});

test('narrow attributes preserve raw evidence separately from LF source bytes', () => {
  const attributes = read('.gitattributes');
  assert.match(attributes, /evidence\/raw\/\*\* -text -diff/);
  assert.match(attributes, /\*\.js text eol=lf/);
  const hashes = ownedSnapshot();
  for (const file of Object.keys(hashes).filter(file => !file.startsWith(`evidence${path.sep}raw${path.sep}`))) {
    const bytes = fs.readFileSync(path.join(root, file));
    assert.equal(bytes.includes(Buffer.from('\r\n')), false, `${file} must have narrow LF source bytes`);
  }
});

test('capture gate is exact and normal verification preserves all owned bytes', () => {
  for (const value of [undefined, null, true, 1, '', 'true', 'yes', '01', '1 ', ' 1', '0']) assert.equal(captureEnabled(value), false);
  assert.equal(captureEnabled('1'), true);
  const before = ownedSnapshot();
  const model = require(path.join(root, 'model.js'));
  let state = model.transition(model.createState(), 'begin', { fixture: 'redundant', scopeClaim: 'application-worker' });
  for (const action of ['observe-baseline', 'record-loss', 'measure', 'recover', 'reset']) state = model.transition(state, action);
  assert.equal(model.validateState(state), true);
  assert.deepEqual(ownedSnapshot(), before);
});

test('native remainder has honest gates and zero extra credits', () => {
  const remainder = JSON.parse(read('remainder.json'));
  assert.equal(remainder.kanoUnit, manifest.kanoUnit);
  assert.equal(remainder.sourceParentComplete, false);
  assert.equal(remainder.testRepairProofRefinementCredits, 0);
  assert.equal(remainder.nativeRemainder.cardId, 'B-S111');
  assert.equal(remainder.nativeRemainder.readiness, false);
  assert.deepEqual(remainder.nativeRemainder.technicalGates, ['CORE', 'DATA', 'AKS', 'C078']);
  assert.match(remainder.nativeRemainder.blocker, /not approved/);
  assert.equal(remainder.nativeRemainder.additionalKanoCredits, 0);
  assert.equal(remainder.acceptanceAuthority, 'parent controller only, once');
});
