'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const bytes = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(bytes(file).toString('utf8'));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const canonical = (data) => Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
const evidence = (...parts) => path.join('evidence', ...parts);
const git = (args, input) => {
  const result = spawnSync('git', ['--no-pager', ...args], { cwd: repo, input, encoding: null, windowsHide: true });
  assert.equal(result.status, 0, String(result.stderr || result.error));
  return result.stdout;
};

test('exact S060, D-S060, A card and portable/atomic/packet source are raw-preserved and Git-qualified', () => {
  const source = json(evidence('source-contract.json'));
  assert.equal(source.cardId, 'A-S060');
  assert.equal(source.parentId, 'D-S060');
  assert.equal(source.kano, 'S');
  assert.equal(source.kanoUnit, 'A-S060');
  assert.equal(source.packet, 'SC-S060');
  assert.equal(source.owner, 'worker-A-S060');
  assert.equal(source.ownedScope, 'learning\\S060\\**');
  assert.equal(source.entryGate, 'SOURCE');
  assert.match(source.baselineCommit, /^[a-f0-9]{40}$/);
  assert.equal(source.sourceRow,
    '| S060 | **Rollback after schema evolution:** Preserve old-version compatibility or use explicit forward recovery when reversal is unsafe. |');
  assert.equal(source.backlogRow,
    '| D-S060 | P0 | Add rollback-compatible and irreversible schema/data change modes. | Compatible rollback preserves data; irreversible changes invoke explicit forward recovery, not a fake successful reversal. | D-S054 |');
  assert.equal(source.cardRow,
    '| A-S060 | D-S060 | S | Roll back after schema evolution; distinguish compatible reversal from required forward recovery. | SOURCE |');
  assert.equal(source.sourceFiles.length, 6);
  for (const entry of source.sourceFiles) {
    const snapshot = bytes(evidence(entry.snapshot));
    assert.equal(snapshot.length, entry.rawBytes, entry.snapshot);
    assert.equal(sha(snapshot), entry.rawSha256, entry.snapshot);
    assert.equal(snapshot.includes(Buffer.from('\r\n')), entry.rawHasCRLF, entry.snapshot);
    const committed = git(['cat-file', 'blob', entry.gitBlob]);
    assert.equal(sha(committed), entry.canonicalGitFileSha256);
    assert.equal(git(['rev-parse', `${source.baselineCommit}:${entry.gitPath}`]).toString().trim(), entry.gitBlob);
    assert.equal(sha(canonical(snapshot)), entry.canonicalSelectedSha256);
    assert.ok(canonical(committed).includes(canonical(snapshot)), entry.snapshot);
  }
  const contract = bytes(evidence('source-portable-contract.snapshot')).toString();
  assert.match(contract, /genuine behavioral TDD red/);
  assert.match(contract, /### Portable A-card lesson contract/);
  assert.match(contract, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(bytes(evidence('source-packet-rule.snapshot')).toString(), /every other A\/B card belongs to SC-Snnn/);
  assert.match(bytes(evidence('source-native-sibling.snapshot')).toString(), /B-S060.*retained committed state.*CORE, DATA, HOST, FENCE/);
  assert.match(source.refinement, /no additional unit, parent or native work is admitted/i);
});

test('narrow raw attributes preserve CRLF snapshots while Git source paths correctly qualify canonical text', () => {
  const attrs = bytes('.gitattributes').toString();
  assert.match(attrs, /evidence\/\*\.snapshot -text/);
  assert.match(attrs, /evidence\/\*\*\/\*\.snapshot -text/);
  assert.match(attrs, /evidence\/\*\*\/\*\.raw -text/);
  for (const file of [
    evidence('source-readme.snapshot'), evidence('source-backlog.snapshot'),
    evidence('source-portable-contract.snapshot'), evidence('red', 'model.js.snapshot'),
    evidence('red', 'stdout.raw'),
  ]) {
    const gitPath = `learning/S060/${file.replace(/\\/g, '/')}`;
    const attributes = git(['check-attr', 'text', '--', gitPath]).toString().trim();
    assert.ok(attributes.endsWith(': text: unset'), attributes);
    assert.equal(git(['hash-object', `--path=${gitPath}`, '--stdin'], bytes(file)).toString().trim(),
      git(['hash-object', '--no-filters', '--stdin'], bytes(file)).toString().trim());
  }
  for (const file of ['model.js', 'index.html', path.join('tests', 'integrity.test.cjs')]) {
    const gitPath = `learning/S060/${file.replace(/\\/g, '/')}`;
    assert.match(git(['check-attr', 'eol', '--', gitPath]).toString(), /: eol: lf/);
    assert.equal(git(['hash-object', `--path=${gitPath}`, '--stdin'], bytes(file)).toString().trim(),
      git(['hash-object', '--no-filters', '--stdin'], canonical(bytes(file))).toString().trim());
  }
});

test('behavioral RED is the real v2 versus v1 assertion from a loadable stub, with non-discovered original snapshots', () => {
  const red = json(evidence('red', 'run.json'));
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 1);
  assert.equal(red.passed, 0);
  assert.equal(red.failed, 1);
  assert.equal(red.assertionFailures, 1);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.spawnError, null);
  assert.equal(red.signal, null);
  const stdout = bytes(evidence('red', 'stdout.raw'));
  const stderr = bytes(evidence('red', 'stderr.raw'));
  assert.equal(sha(stdout), red.rawStdoutSha256);
  assert.equal(sha(stderr), red.rawStderrSha256);
  const text = stdout.toString() + stderr.toString();
  assert.match(text, /code: 'ERR_ASSERTION'/);
  assert.match(text, /expected: 'v1'/);
  assert.match(text, /actual: 'v2'/);
  assert.doesNotMatch(text, /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError/);
  assert.equal(red.snapshots.length, 4);
  for (const entry of red.snapshots) {
    assert.ok(entry.snapshot.endsWith('.snapshot'));
    assert.doesNotMatch(entry.snapshot, /\.(?:test\.)?(?:cjs|js|mjs)$/);
    const snapshot = bytes(evidence('red', entry.snapshot));
    assert.equal(snapshot.length, entry.bytes);
    assert.equal(sha(snapshot), entry.sha256);
    if (entry.source !== 'model.js') assert.deepEqual(canonical(bytes(entry.source)), canonical(snapshot));
  }
  const stub = bytes(evidence('red', 'model.js.snapshot')).toString();
  assert.match(stub, /return state;/);
  assert.doesNotMatch(stub, /function recovery|Unsafe reversal rejected|authentic = new WeakSet/);
});

test('source to RED to explicit IaC N/A to initial green follows the required implementation order', () => {
  const source = json(evidence('source-contract.json'));
  const red = json(evidence('red', 'run.json'));
  const decision = json(evidence('iac-decision.json'));
  const green = json(evidence('initial-green', 'run.json'));
  assert.equal(decision.status, 'N/A');
  assert.match(decision.stage, /After genuine behavioral RED and before behavior implementation/);
  assert.match(decision.reason, /Resource-free offline synthetic schema-recovery lesson/);
  assert.equal(decision.afterRedCompletedAtUtc, red.completedAtUtc);
  assert.ok(Date.parse(source.sourceReadAndQualifiedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.completedAtUtc) < Date.parse(decision.decidedAtUtc));
  assert.ok(Date.parse(decision.decidedAtUtc) < Date.parse(green.startedAtUtc));
});

test('frozen lesson manifest and evidence retain exact acceptance and bounded synthetic-only scope', () => {
  const manifest = json('manifest.json');
  const record = json('evidence.json');
  for (const value of [manifest, record]) {
    assert.equal(value.cardId, 'A-S060');
    assert.equal(value.parentId, 'D-S060');
    assert.equal(value.kano, 'S');
    assert.equal(value.kanoUnit, 'A-S060');
    assert.equal(value.packet, 'SC-S060');
    assert.equal(value.owner, 'worker-A-S060');
    assert.equal(value.sourceAcceptance,
      'Compatible rollback preserves data; irreversible changes invoke explicit forward recovery, not a fake successful reversal.');
    assert.equal(value.iac.status, 'N/A');
    assert.match(value.limits.join(' '), /production24/);
    assert.match(value.limits.join(' '), /source-parent/);
  }
  assert.equal(manifest.entryPoint, 'learning/S060/index.html');
  assert.equal(manifest.bounds.retainedDecisions, 12);
  assert.equal(manifest.bounds.arbitraryDataOrEndpoints, false);
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(record.acceptedAtUtc, null);
  assert.equal(record.verification.ordinaryTestsWriteProof, false);
  assert.equal(record.verification.browserCaptureRequires, 'CAPTURE_BROWSER_EVIDENCE=1');
  assert.match(bytes('README.md').toString(), /not.*actual database migration\/rollback proof/s);
});

test('focused green and syntax retain raw output and use only already-present Node22 tooling', () => {
  for (const stage of ['initial-green', 'green', 'syntax-002']) {
    const record = json(evidence(stage, 'run.json'));
    assert.equal(record.exitCode, 0, stage);
    assert.equal(record.runtime, 'v22.23.4');
    assert.equal(record.spawnError, null);
    assert.equal(record.signal, null);
    assert.equal(record.missingCodeOrTools, false);
    assert.equal(record.failed, 0);
    assert.equal(sha(bytes(evidence(stage, 'stdout.raw'))), record.rawStdoutSha256);
    assert.equal(sha(bytes(evidence(stage, 'stderr.raw'))), record.rawStderrSha256);
    if (stage.startsWith('syntax')) assert.equal(record.commands.length, 9);
    else {
      assert.equal(record.tests, 21);
      assert.equal(record.passed, 21);
    }
  }
  const tooling = json(evidence('tooling.json'));
  assert.equal(tooling.node.version, 'v22.23.4');
  assert.equal(tooling.playwright.version, '1.56.1');
  assert.match(tooling.browser.version, /^156\./);
  assert.equal(tooling.browser.signatureStatus, 'Valid');
  assert.match(tooling.browser.signerSubject, /Microsoft Corporation/);
  assert.equal(tooling.dependenciesChanged, false);
  assert.equal(tooling.browser.downloaded, false);
});

test('real DOM evidence binds tested sources, keyboard focus, both recovery paths, failures, unknowns and retained reset', () => {
  const proof = json(evidence('browser.json'));
  assert.equal(proof.cardId, 'A-S060');
  assert.equal(proof.outcome, 'PASS');
  assert.equal(proof.captureExplicitlyEnabled, true);
  assert.equal(proof.observations.length, 13);
  for (const [file, hash] of Object.entries(proof.testedSourceHashes)) assert.equal(sha(canonical(bytes(file))), hash, file);
  const named = (part) => {
    const result = proof.observations.find((entry) => entry.name.includes(part));
    assert.ok(result, part);
    return result;
  };
  assert.match(named('stale state').alert, /requires ready/);
  const compatible = named('compatible keyboard');
  assert.match(compatible.phase, /active code: v1.*schema: expanded/);
  assert.match(compatible.observed, /3\/3.*USD 4000/);
  assert.equal(compatible.activeElement, 'reset-rehearsal');
  const blocked = named('unsafe irreversible');
  assert.match(blocked.result, /SAFE ABORT/);
  assert.match(blocked.phase, /active code: v2.*schema: v2-only/);
  assert.equal(blocked.activeElement, 'forward');
  const forward = named('explicit forward recovery');
  assert.match(forward.phase, /active code: v2\.1/);
  assert.match(forward.observed, /3\/3.*USD 3500 \+ EUR 700/);
  assert.equal(forward.history[2][2], 'forward');
  assert.match(named('missing committed read').result, /FAILURE/);
  assert.match(named('missing committed read').observed, /2\/3/);
  assert.match(named('unavailable forward').result, /UNKNOWN/);
  const retained = named('reset retains failed and unknown');
  assert.equal(retained.history.length, 5);
  assert.equal(retained.history[3][3], 'failure');
  assert.equal(retained.history[4][3], 'unknown');
  assert.match(retained.metrics, /success fraction: 2\/4/);
  assert.equal(retained.activeElement, 'mode');
  assert.match(named('invalid input').alert, /mode: unsupported value/);
  assert.match(named('forced recovery').alert, /requires evolved/);
  const capacity = named('bounded capacity');
  assert.equal(capacity.history.length, 12);
  assert.match(capacity.metrics, /failure: 1.*unknown: 1.*success fraction: 9\/11/);
  assert.match(capacity.alert, /History limit: 12/);
});

test('CSP is actually enforced, normal exercise has no network/errors, and isolated browser closes in finally', () => {
  const proof = json(evidence('browser.json'));
  const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
  const expected = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
  assert.equal(sha(fs.readFileSync(helper)), expected);
  assert.equal(proof.helper.sha256, expected);
  assert.equal(proof.helper.publication, '53c0c0d');
  assert.equal(proof.runtime, 'v22.23.4');
  assert.equal(proof.playwrightVersion, '1.56.1');
  assert.match(proof.browserVersion, /^156\./);
  assert.equal(proof.inlineRan, false);
  assert.equal(proof.evalRan, false);
  assert.equal(proof.cspAttempt.evalError, 'EvalError');
  assert.equal(proof.cspAttempt.fetchError, 'TypeError');
  assert.equal(proof.cspAttempt.pageLoadedScript, true);
  for (const directive of ['script-src-elem', 'script-src', 'connect-src', 'form-action']) {
    assert.ok(proof.cspViolations.some((entry) => entry.effectiveDirective === directive), directive);
  }
  assert.ok(proof.cspViolations.every((entry) => entry.disposition === 'enforce'));
  assert.deepEqual(proof.pageErrors, []);
  assert.deepEqual(proof.exerciseNetworkRequests, []);
  assert.deepEqual(proof.probeResponses, []);
  assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
  assert.deepEqual(proof.cleanup, { browserCloseAwaited: true, result: 'closed', serversStarted: 0 });
  const driver = bytes(path.join('tests', 'browser.test.cjs')).toString();
  assert.match(driver, /await openIsolatedLesson\('learning\\\\S060\\\\index\.html'\)/);
  assert.match(driver, /finally \{[\s\S]*await session\.close\(\)/);
  assert.match(driver, /const capture = process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(driver, /if \(capture\) fs\.writeFileSync/);
  assert.doesNotMatch(driver, /--no-sandbox|ignoreHTTPSErrors|bypassCSP:\s*true|chromium\.launch|lifecycle-prototype|connectOverCDP/);
});

test('the earlier DevTools CSP probe is preserved as an unqualified failure, never promoted to successful evidence', () => {
  const directory = evidence('csp-probe-qualification');
  const qualification = json(path.join(directory, 'qualification.json'));
  const failed = json(path.join(directory, 'browser-failed.json'));
  assert.equal(sha(bytes(path.join(directory, qualification.failedCapture))), qualification.failedCaptureSha256);
  assert.equal(sha(bytes(path.join(directory, qualification.originalDriver))), qualification.originalDriverSha256);
  assert.equal(failed.outcome, 'FAIL');
  assert.equal(failed.cspAttempt.evalError, null);
  assert.match(failed.failure.message, /Timeout/);
  assert.equal(failed.cleanup.result, 'closed');
  assert.equal(failed.observations.length, 12);
  assert.match(qualification.reason, /DevTools.*eval.*owned external page-loaded script/);
  assert.equal(qualification.extraKanoCredit, false);
  const original = bytes(path.join(directory, 'browser.test.cjs.snapshot'));
  assert.equal(sha(canonical(original)), failed.testedSourceHashes['tests\\browser.test.cjs']);
});

test('complete owned content index verifies exact raw evidence and canonical LF source without omitted files', () => {
  const index = json(evidence('content-index.json'));
  assert.equal(index.cardId, 'A-S060');
  assert.equal(index.ordinaryVerificationWrites, false);
  assert.deepEqual(index.excludes, ['evidence\\content-index.json (self-reference)']);
  const found = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) {
        const file = path.relative(root, full);
        if (file !== evidence('content-index.json')) found.push(file);
      } else assert.fail(`Unsupported owned file type: ${full}`);
    }
  };
  visit(root);
  assert.deepEqual(index.files.map((entry) => entry.path).sort(), found.sort());
  for (const entry of index.files) {
    const full = path.resolve(root, entry.path);
    assert.ok(full.startsWith(`${root}${path.sep}`), entry.path);
    const raw = /\.(?:snapshot|raw)$/.test(entry.path);
    assert.equal(entry.representation, raw ? 'raw' : 'canonical-lf');
    const data = raw ? bytes(entry.path) : canonical(bytes(entry.path));
    assert.equal(data.length, entry.bytes, entry.path);
    assert.equal(sha(data), entry.sha256, entry.path);
  }
});
