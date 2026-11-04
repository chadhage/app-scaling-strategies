'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const base = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(base, file));
const json = file => JSON.parse(read(file));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const rawProof = file => file.startsWith('evidence\\raw\\') || file.startsWith('evidence\\red\\');
const canonicalBytes = (file, bytes) => rawProof(file) ? bytes : Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'), 'utf8');
const manifest = json('manifest.json');
const source = json('evidence\\source.json');

test('manifest binds exact S117, D-S117, portable card and source-scenario packet acceptance', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.cardId, 'A-S117');
  assert.equal(manifest.sourceId, 'S117');
  assert.deepEqual(manifest.parentIds, ['D-S117']);
  assert.equal(manifest.packet, 'SC-S117');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S117');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.owner, 'worker-A-S117');
  assert.equal(manifest.nativeSibling, 'B-S117');
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.additionalKanoCredits, 0);
  assert.equal(manifest.objective, source.card.deliver);
  assert.equal(source.card.technicalEntryGate, 'SOURCE');
  assert.equal(source.card.packet, manifest.packet);
  assert.deepEqual(source.packet.members, ['A-S117', 'B-S117']);
  assert.equal(source.packet.sourceParentCompleted, false);
  assert.equal(source.rows[0].row, `| S117 | **Partial regional failure:** ${manifest.sourceRequiredBehavior} |`);
  assert.equal(source.rows[1].row, `| D-S117 | P2 | Add partial regional dependency failure while shallow origin probes stay healthy. | ${manifest.sourceAcceptance} | P006, D-S022 |`);
  assert.equal(source.rows[2].row, `| A-S117 | D-S117 | S | ${manifest.objective} | SOURCE |`);
  for (const field of ['preconditions', 'actions', 'expectedAssertions', 'limits']) assert.ok(manifest[field].length >= 3);
  assert.equal(manifest.syntheticInput.maximumSamples, 6);
  assert.equal(manifest.syntheticInput.maximumHistoryRuns, 8);
});

test('historical raw CRLF source and canonical Git LF remain separate byte proofs', () => {
  assert.match(source.sourceCommit, /^[a-f0-9]{40}$/);
  for (const row of source.rows) {
    const raw = read(row.rawPath), canonical = read(row.gitPath);
    assert.equal(sha(raw), row.rawRowSha256);
    assert.equal(sha(canonical), row.gitRowSha256);
    assert.equal(raw.toString().trimEnd(), row.row);
    assert.equal(canonical.toString().trimEnd(), row.row);
    assert.equal(raw.toString().endsWith('\r\n'), row.rawEnding === 'CRLF');
    assert.equal(canonical.toString().endsWith('\r\n'), row.gitEnding === 'CRLF');
    assert.notEqual(row.rawRowSha256, row.gitRowSha256);
    assert.match(row.rawFileSha256, /^[a-f0-9]{64}$/);
    assert.match(row.gitFileSha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(sha(read(source.contract.rawPath)), source.contract.rawSha256);
  assert.equal(sha(read(source.contract.gitPath)), source.contract.gitSha256);
  assert.equal(read(source.contract.rawPath).toString().replaceAll('\r\n', '\n'), read(source.contract.gitPath).toString());
  assert.match(read('.gitattributes').toString(), /evidence\/raw\/\*\* -text -eol/);
  assert.match(read('.gitattributes').toString(), /evidence\/red\/\*\* -text -eol/);
});

test('BDD and loadable original stub preserve a real behavioral ERR_ASSERTION RED outside autodiscovery', () => {
  const red = json('evidence\\red\\red.json');
  const load = json('evidence\\red\\loadable-stub.json');
  assert.equal(red.beforeImplementation, true);
  assert.equal(red.exitCode, 1);
  assert.equal(red.assertionCode, 'ERR_ASSERTION');
  assert.equal(red.expected, 'negative');
  assert.equal(red.actual, 'positive');
  assert.equal(load.exportsAreFunctions, true);
  assert.equal(load.syntaxChecked, true);
  assert.equal(sha(read('evidence\\red\\assertion-red.stdout.snapshot')), red.stdoutSha256);
  assert.equal(sha(read('evidence\\red\\assertion-red.stderr.snapshot')), red.stderrSha256);
  assert.match(read('evidence\\red\\assertion-red.stdout.snapshot').toString(), /not ok[\s\S]*ERR_ASSERTION/);
  assert.equal(read('evidence\\red\\bdd.snapshot').toString().replaceAll('\r\n', '\n'), read('partial-failure.feature').toString().replaceAll('\r\n', '\n'));
  const context = { module: { exports: {} } };
  vm.runInNewContext(read('evidence\\red\\model.stub.snapshot').toString(), context);
  const stub = context.module.exports;
  const chosen = { fixtureId: 'cedar-inventory-failure', journey: 'checkout', policy: 'shallow', samples: 4 };
  assert.equal(stub.rehearse(stub.createState(), chosen).result.verdict, 'positive');
  const implemented = require('..\\model.js');
  assert.equal(implemented.rehearse(implemented.createState(), chosen).result.verdict, 'negative');
  assert.equal(fs.readdirSync(path.join(base, 'evidence\\red')).some(name => /(?:\.test|\.spec)\.[cm]?js$/.test(name)), false);
});

test('IaC is N/A and the native remainder is honest blocked work with no extra credit', () => {
  const iac = json('evidence\\iac.json'), refinement = json('evidence\\refinement.json');
  assert.equal(iac.applicable, false);
  assert.equal(iac.result, 'N/A');
  assert.match(iac.stage, /After genuine behavioral assertion RED, before implementation/);
  for (const field of ['infrastructureGenerated', 'resourceOperations', 'identityOperations', 'networkFaultOperations', 'deploymentOrSpending', 'nativeSiblingCompleted', 'sourceParentCompleted']) {
    assert.equal(iac[field], false);
  }
  assert.equal(refinement.originalKanoUnit, 'A-S117');
  assert.equal(refinement.additionalUnitsOrCredits, 0);
  assert.equal(refinement.relatedRemainder.readiness, false);
  assert.deepEqual(refinement.relatedRemainder.technicalGates, ['CORE', 'DATA', 'REGION']);
  assert.equal(refinement.relatedRemainder.nativeEvidenceSupplied, false);
  assert.equal(refinement.relatedRemainder.sourceParentCompleted, false);
});

test('portable local assets, safe DOM text, strict CSP, keyboard labels and unshadowed reset', () => {
  const html = read('index.html').toString();
  const model = read('model.js').toString(), app = read('app.js').toString();
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.deepEqual([...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)].map(match => match[1]), ['model.js', 'app.js']);
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.equal(/<style\b|\bon[a-z]+=["']|\b(?:id|name)="reset"/i.test(html), false);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) assert.ok(html.includes(directive));
  for (const id of ['fixture-choice', 'journey-choice', 'policy-choice', 'sample-count']) assert.ok(html.includes(`for="${id}"`));
  assert.match(html, /id="error-message" role="alert"/);
  assert.match(html, /id="result-status" role="status" aria-live="polite"/);
  assert.match(html, /id="run-button" type="submit" disabled/);
  assert.match(html, /id="reset-button" type="button" disabled/);
  assert.match(app, /form\.reset\(\)/);
  assert.equal(/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b|\b(?:eval|Function)\s*\(|innerHTML|document\.write|Date\.now|Math\.random/.test(model + app), false);
  assert.equal(/https?:|wss?:|<iframe|<form[^>]*action=/i.test(html), false);
});

test('source and immutable raw proof files match their scoped SHA-256 integrity seal', () => {
  const seal = json('evidence\\integrity.json');
  assert.equal(seal.scope, 'learning\\S117');
  assert.equal(seal.algorithm, 'sha256');
  assert.equal(seal.hashPolicy, 'Raw proof bytes remain exact; ordinary text has separate working-raw and canonical-Git-LF hashes.');
  assert.ok(Object.keys(seal.files).length >= 20);
  for (const [file, expected] of Object.entries(seal.files)) {
    const absolute = path.resolve(base, file);
    assert.ok(absolute.startsWith(base + path.sep));
    assert.equal(fs.lstatSync(absolute).isFile(), true);
    const actual = fs.readFileSync(absolute);
    assert.equal(sha(canonicalBytes(file, actual)), expected, file);
    assert.ok(sha(actual) === seal.workingRawSha256[file] || (!rawProof(file) && sha(actual) === expected), `${file}: unknown working-byte representation`);
  }
  for (const file of ['.gitattributes', 'index.html', 'model.js', 'app.js', 'styles.css', 'manifest.json', 'lesson.txt', 'partial-failure.feature', 'tests\\model.test.cjs', 'tests\\integrity.test.cjs', 'tests\\browser.test.cjs', 'tests\\browser-evidence.test.cjs', 'evidence\\source.json', 'evidence\\iac.json', 'evidence\\refinement.json', 'evidence\\red\\model.stub.snapshot', 'evidence\\red\\assertion-red.stdout.snapshot']) assert.ok(Object.hasOwn(seal.files, file), file);
});

test('browser runner requires the published helper, awaited finally close and exact capture opt-in', () => {
  const runner = read('tests\\browser.test.cjs').toString();
  assert.match(runner, /const capture = process\.env\.CAPTURE_BROWSER_EVIDENCE === '1';/);
  assert.match(runner, /finally \{\s+await session\.close\(\);/);
  assert.match(runner, /if \(capture\) \{\s+fs\.writeFileSync\(evidencePath/);
  assert.match(runner, /Ordinary verification must preserve historical browser evidence bytes/);
  assert.equal((runner.match(/fs\.writeFileSync\(/g) || []).length, 1);
  assert.ok(runner.includes(manifest.verification.helperWorkingSha256));
  assert.ok(runner.includes(manifest.verification.helperCanonicalGitSha256));
  assert.ok(runner.includes(manifest.verification.helperPublishedCommit));
});
