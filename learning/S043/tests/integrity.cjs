'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const evidence = path.join(root, 'evidence');
const bytes = (file) => fs.readFileSync(path.join(root, file));
const read = (file) => JSON.parse(bytes(file).toString('utf8'));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const normalized = (value) => value.toString('utf8').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
const seal = read('evidence\\content-hashes.json');
let assertions = 0;
const verify = (condition, message) => { assert.ok(condition, message); assertions++; };

verify(seal.algorithm === 'SHA-256' && seal.cardId === 'A-S043', 'Scoped content seal');
if (seal.previousSeal) {
  verify(sha256(bytes(seal.previousSeal.artifact)) === seal.previousSeal.sha256, 'Original pre-publication seal preserved');
  const publicationRed = read('evidence\\publication-red.raw.json');
  verify(publicationRed.exitCode === 2, 'Actual CRLF publication-gate failure preserved, not behavioral RED');
  verify(sha256(bytes('evidence\\publication-red\\attributes.source.snapshot'))
    === publicationRed.inputSha256['.gitattributes'], 'Exact pre-fix publication attributes');
}
verify(bytes('.gitattributes').toString('utf8')
  .includes('whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol'),
  'CRLF recognized while ordinary whitespace checks remain enabled');
for (const [file, hash] of Object.entries(seal.files)) {
  verify(!path.isAbsolute(file) && !file.split(/[\\/]/).includes('..'), `Owned path: ${file}`);
  verify(sha256(bytes(file)) === hash, `Sealed bytes: ${file}`);
}
for (const file of ['upload.js', 'app.js', 'index.html', 'styles.css', 'manifest.json', 'README.md',
  'evidence.json', 'capture.cjs', 'verify.cjs', 'tests\\browser.cjs', 'tests\\integrity.cjs']) {
  verify(Object.hasOwn(seal.files, file), `Required source sealed: ${file}`);
}
const records = fs.readdirSync(evidence).filter((file) => file.endsWith('.raw.json'));
for (const file of records) {
  const record = read(path.join('evidence', file));
  verify(record.error === null && record.signal === null, `No tooling failure: ${file}`);
  verify(record.inputsUnchanged === true, `Capture did not alter tested source: ${file}`);
  verify(record.startedAtUtc <= record.finishedAtUtc, `Ordered timestamps: ${file}`);
  verify(record.nodeVersion.startsWith('v22.'), `Existing test runtime: ${file}`);
  for (const stream of ['stdout', 'stderr']) {
    const raw = Buffer.from(record[stream].base64, 'base64');
    verify(raw.length === record[stream].length, `Raw byte length: ${file}/${stream}`);
    verify(sha256(raw) === record[stream].sha256, `Raw byte digest: ${file}/${stream}`);
    const readableFile = path.join(evidence, `${record.phase}.${stream}.txt`);
    verify(fs.readFileSync(readableFile, 'utf8') === normalized(raw), `Readable normalization: ${file}/${stream}`);
  }
}
const red = read('evidence\\red.raw.json');
const replay = read('evidence\\red-replay.raw.json');
const stubLoad = read('evidence\\stub-load.raw.json');
const iac = read('evidence\\iac-na.json');
const summary = read('evidence.json');
const redOutput = Buffer.from(red.stdout.base64, 'base64').toString('utf8');
verify(stubLoad.exitCode === 0 && red.exitCode === 1 && replay.exitCode === 1, 'Expected load and assertion RED exits');
verify(redOutput.includes('ERR_ASSERTION') && redOutput.includes("actual: 'unknown'")
  && redOutput.includes("expected: 'success'"), 'Real behavioral assertion, not an absent function');
verify(!/MODULE_NOT_FOUND|Cannot find module|SyntaxError/.test(redOutput), 'No tooling/import RED');
for (const [source, snapshot] of [
  ['upload.js', 'upload.source.snapshot'],
  ['multipart.feature', 'bdd.feature.snapshot'],
  ['tests\\model.test.cjs', 'assertion.source.snapshot'],
]) {
  verify(sha256(bytes(path.join('evidence', 'red', snapshot))) === red.inputSha256[source], `Exact original RED snapshot: ${snapshot}`);
}
verify(iac.status === 'N/A' && iac.decidedAtUtc >= red.finishedAtUtc, 'IaC N/A follows RED');
verify(iac.prerequisiteRedSha256 === sha256(bytes('evidence\\red.raw.json')), 'IaC decision binds exact RED');
const focusRed = read('evidence\\browser-002.raw.json');
const focusObservation = read('evidence\\browser-002.json');
verify(focusRed.exitCode === 1 && focusObservation.verdict === 'FAIL'
  && focusObservation.failure.includes('reset-lesson') && focusObservation.failure.includes('storage'),
  'Genuine actual-browser reset-focus RED retained');
verify(sha256(bytes('evidence\\reset-focus-red\\app.source.snapshot')) === focusRed.inputSha256['app.js'],
  'Exact pre-fix reset app snapshot');
verify(sha256(bytes('evidence\\reset-focus-red\\browser.source.snapshot')) === focusRed.inputSha256['tests\\browser.cjs'],
  'Exact reset-focus assertion snapshot');
verify(sha256(bytes('evidence\\browser-first-check.source.snapshot'))
  === read('evidence\\browser.raw.json').inputSha256['tests\\browser.cjs'],
  'Failed fieldset oracle remains separately attributable');
verify(read(summary.tests.green.artifact).startedAtUtc >= iac.decidedAtUtc, 'GREEN follows IaC decision');
for (const phase of ['green', 'syntax', 'browser']) {
  const artifact = phase === 'browser' ? summary.tests.browser.rawArtifact : summary.tests[phase].artifact;
  verify(read(artifact).exitCode === 0, `${phase} actual exit`);
}
verify(summary.tests.green.failed === 0 && summary.tests.green.tests > 0, 'Focused tests passed');
verify(summary.kano === 'S' && summary.kanoUnit === 'A-S043' && summary.acceptedAtUtc === null
  && !summary.reviewer.workerSelfAccepted, 'Single frozen S unit; no self-acceptance');
const browser = read(summary.tests.browser.artifact);
verify(browser.verdict === 'PASS' && browser.checks.every((item) => item.result === 'PASS'), 'Actual browser checks');
verify(browser.checks.length === summary.tests.browser.actualChecks && browser.checks.length >= 13, 'Actual browser check count');
verify(browser.cleanup.awaitedCloseInFinally === true, 'Awaited owned browser cleanup');
verify(browser.observations.final.phase === 'idle' && browser.observations.final.historyCount === 10, 'Final reset and retained history');
verify(browser.observations.safe.sha256 === read('manifest.json').syntheticInput.expectedSha256, 'Actual browser hash');
verify(browser.observations.csp.fallbackTransportGuardHits === 0
  && browser.observations.csp.violations.includes('connect-src')
  && !browser.observations.csp.inlineExecuted && !browser.observations.csp.handlerExecuted, 'Enforced browser CSP');
const tooling = read('evidence\\tooling.json');
verify(tooling.edge.Status === 'Valid' && tooling.edge.Signer.includes('Microsoft Corporation'), 'Actual installed Edge signature');
verify(tooling.playwrightVersion === '1.56.1' && browser.playwrightVersion === '1.56.1'
  && browser.browserVersion.startsWith('156.'), 'Approved offline tooling pairing');
const helper = path.resolve(root, '..', '..', 'testing', 'browser', 'isolated.cjs');
verify(sha256(fs.readFileSync(helper)) === '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055',
  'Published helper bytes, not abandoned lifecycle prototype');
process.stdout.write(`Integrity PASS: ${assertions} checks; sealed source and raw proof preserved.\n`);
