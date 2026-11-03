'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const bytes = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(bytes(file).toString('utf8'));
const evidence = (...parts) => path.join('evidence', ...parts);
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const canonical = (data) => Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
const raw = (file) => zlib.gunzipSync(bytes(file));
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: repo });
const source = json(evidence('source-contract.json'));
const browser = json(evidence('browser-001.json'));
const observed = (name) => {
  const observation = browser.observations.find((entry) => entry.name.includes(name));
  assert.ok(observation, `Browser observation: ${name}`);
  return observation;
};

test('exact source/backlog/card/portable contract and default packet have raw CRLF and canonical Git provenance', () => {
  assert.deepEqual([source.cardId, source.sourceId, source.parentId, source.kano, source.kanoUnit,
    source.packet, source.workerId, source.ownedScope],
  ['A-S054', 'S054', 'D-S054', 'S', 'A-S054', 'SC-S054', 'worker-A-S054', 'learning\\S054\\**']);
  assert.equal(source.sourceRow,
    '| S054 | **Database expand-migrate-contract:** Add compatible structures, migrate safely, and remove old structures only after old consumers disappear. |');
  assert.equal(source.backlogRow,
    '| D-S054 | P0 | Add staged **Expand, migrate, contract** data operations while both versions serve journeys. | Old/new consumers remain valid during overlap; contraction is blocked until dependent consumers/work disappear. | none |');
  assert.equal(source.cardRow,
    '| A-S054 | D-S054 | S | Sequence expand, migrate, and contract; reject contraction while old consumers remain. | SOURCE |');
  assert.match(source.nativeSibling, /CORE, DATA, HOST, FENCE/);
  assert.match(source.packetRule, /every other A\/B card belongs to SC-Snnn/);
  assert.equal(source.claim.owner, 'worker-A-S054');
  assert.equal(source.claim.state, 'In Progress');
  assert.equal(source.entries.length, 7);
  for (const entry of source.entries) {
    const snapshot = bytes(evidence(entry.snapshot));
    assert.equal(sha(snapshot), entry.rawExcerptSha256, entry.snapshot);
    assert.equal((snapshot.toString().match(/\r\n/g) || []).length, entry.rawCRLFCount, entry.snapshot);
    assert.equal(sha(canonical(snapshot)), entry.canonicalGitExcerptSha256, entry.snapshot);
    const committed = git('show', `${source.baselineCommit}:${entry.file.replace(/\\/g, '/')}`);
    assert.equal(sha(committed), entry.gitFileSha256, entry.file);
    const text = committed.toString();
    const from = text.indexOf(entry.start);
    assert.ok(from >= 0);
    const to = entry.end === 'end of exact source row' ? text.indexOf('\n', from) + 1
      : text.indexOf(entry.end, from + entry.start.length);
    assert.ok(to > from);
    assert.equal(sha(canonical(Buffer.from(text.slice(from, to)))), entry.canonicalGitExcerptSha256);
  }
  assert.ok(source.entries.some((entry) => entry.rawCRLFCount > 0), 'Retain actual original Windows line endings.');
  assert.match(bytes(evidence('source-portable-contract.snapshot')).toString(), /genuine behavioral TDD red/);
  assert.match(bytes(evidence('source-portable-contract.snapshot')).toString(), /### Portable A-card lesson contract/);
  assert.match(source.refinement, /No additional To Do work is admitted/);
});

test('qualified RED preserves original non-auto-discovered BDD, fixture, stub and test snapshot bytes', () => {
  for (const directory of ['red', 'red-002']) {
    const report = json(evidence(directory, 'run.json'));
    assert.equal(report.snapshots.length, 4);
    for (const snapshot of report.snapshots) {
      assert.match(snapshot.snapshot, /\.snapshot$/);
      assert.doesNotMatch(snapshot.snapshot, /\.(?:cjs|js|mjs)$/);
      const saved = bytes(evidence(directory, snapshot.snapshot));
      assert.equal(sha(saved), snapshot.sha256);
      if (directory === 'red-002' && snapshot.source !== 'model.js') {
        assert.deepEqual(canonical(bytes(snapshot.source)), canonical(saved), snapshot.source);
      }
    }
    const stub = bytes(evidence(directory, 'model.js.snapshot')).toString();
    assert.match(stub, /implementation: 'UNIMPLEMENTED'/);
    assert.match(stub, /function act\(state\) \{ return state; \}/);
    assert.doesNotMatch(stub, /checkReads|migrationCheck|issued = new WeakSet/);
  }
  assert.match(bytes('.gitattributes').toString(), /\*\.snapshot binary/);
  assert.match(bytes('.gitattributes').toString(), /\*\.gz binary/);
});

test('qualified behavioral RED is assertion-only with verbatim raw stream provenance; earlier diagnostic stays explicit', () => {
  for (const directory of ['red', 'red-002']) {
    const report = json(evidence(directory, 'run.json'));
    const stdout = raw(evidence(directory, 'stdout.raw.gz'));
    const stderr = raw(evidence(directory, 'stderr.raw.gz'));
    assert.equal(report.exitCode, 1);
    assert.equal(report.tests, 26);
    assert.equal(report.passed, 1);
    assert.equal(report.failed, 25);
    assert.equal(sha(stdout), report.rawStdoutSha256);
    assert.equal(sha(stderr), report.rawStderrSha256);
    assert.equal(report.assertionFailures, (stdout.toString().match(/code: 'ERR_ASSERTION'/g) || []).length);
    assert.equal(report.missingCodeOrTools, false);
    assert.deepEqual(report.spawnErrors, [null]);
    assert.deepEqual(report.signals, [null]);
    assert.equal(canonical(bytes(evidence(directory, 'output.tap'))).toString(),
      (stdout.toString() + stderr.toString()).replace(/[ \t]+$/gm, '').replace(/\r\n/g, '\n'));
    assert.doesNotMatch(stdout.toString(), /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError/);
  }
  assert.equal(json(evidence('red-002', 'run.json')).assertionFailures, 25);
  assert.doesNotMatch(raw(evidence('red-002', 'stdout.raw.gz')).toString(), /TypeError/);
  assert.equal(json(evidence('red', 'run.json')).assertionFailures, 24);
  assert.match(raw(evidence('red', 'stdout.raw.gz')).toString(), /TypeError/);
  assert.match(json(evidence('iac-decision.json')).earlierDiagnostic, /not the qualified RED/);
});

test('stage order is source to BDD to qualified stub RED to IaC N/A to implementation to green and actual browser', () => {
  const red = json(evidence('red-002', 'run.json'));
  const iac = json(evidence('iac-decision.json'));
  const ledger = json(evidence('source-integrity.json'));
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.redCompletedAtUtc, red.completedAtUtc);
  assert.match(iac.decisionStage, /before behavior implementation/);
  assert.equal(iac.nativeMigrationProved, false);
  const stages = ledger.stageOrder;
  const times = ['sourceCapturedAtUtc', 'bddCreatedAtUtc', 'qualifiedRedStartedAtUtc',
    'qualifiedRedCompletedAtUtc', 'iacDecisionCreatedAtUtc', 'modelImplementationWrittenAtUtc',
    'focusedGreenStartedAtUtc', 'browserStartedAtUtc'].map((key) => Date.parse(stages[key]));
  assert.ok(times.every(Number.isFinite));
  for (let i = 1; i < times.length; i++) assert.ok(times[i] >= times[i - 1], `Ordered stage ${i}`);
});

test('captured actual browser evidence binds current canonical lesson sources and the ordered success/dependency gates', () => {
  assert.equal(browser.cardId, 'A-S054');
  assert.equal(browser.outcome, 'PASS');
  assert.equal(browser.captureExplicitlyEnabled, true);
  assert.equal(browser.observations.length, 16);
  for (const [file, hash] of Object.entries(browser.testedSourceHashes)) {
    assert.equal(sha(canonical(bytes(file))), hash, file);
  }
  assert.match(observed('idle state guard').alert, /active attempt/);
  assert.match(observed('strict numeric').alert, /Observation/);
  assert.match(observed('baseline phase guard').alert, /expanded phase/);
  const expanded = observed('additive expansion');
  assert.equal(expanded.reads.length, 8);
  assert.ok(expanded.reads.every((read) => read[2] === 'PASS'));
  assert.match(expanded.metrics, /8 observed; 8 passed; 0 failed; 0 unknown/);
  const early = observed('before migration');
  assert.equal(early.gate, 'Contraction gate: FAIL — BLOCKED');
  assert.equal(early.impact, 'Synthetic user impact: SAFE_ABORT');
  assert.match(early.dependencies, /legacy structure retained/);
  assert.match(observed('faithful migrated data').reason, /2 old consumers/);
  assert.match(observed('independent old-work gate').reason, /1 old work/);
  assert.match(observed('zero old consumers').reason, /2 old work/);
  const success = observed('ordered fully observed contraction');
  assert.equal(success.gate, 'Contraction gate: PASS — ALLOWED');
  assert.equal(success.impact, 'Synthetic user impact: UNINTERRUPTED');
  assert.match(success.dependencies, /0 old consumers; 4 new consumers; 0 old work pending/);
  assert.match(success.dependencies, /legacy structure removed/);
  assert.equal(success.reads.length, 4);
  assert.ok(success.reads.every((read) => read[1] === 'new' && read[2] === 'PASS'));
});

test('actual failure and unknown results do not disguise interruptions, missing observations or history limits', () => {
  const failure = observed('corrupt migration visibly');
  assert.equal(failure.gate, 'Contraction gate: FAIL — BLOCKED');
  assert.equal(failure.impact, 'Synthetic user impact: INTERRUPTED');
  assert.match(failure.metrics, /8 observed; 7 passed; 1 failed; 0 unknown; 4\/4/);
  assert.match(failure.alert, /verified migration/);
  assert.equal(failure.reads.filter((read) => read[2] === 'FAIL').length, 1);
  const partial = observed('partial faithful');
  assert.equal(partial.gate, 'Contraction gate: UNKNOWN — BLOCKED');
  assert.match(partial.metrics, /2 observed; 2 passed; 0 failed; 6 unknown/);
  const none = observed('absent observations');
  assert.equal(none.impact, 'Synthetic user impact: UNKNOWN');
  assert.match(none.metrics, /0 observed; 0 passed; 0 failed; 8 unknown/);
  assert.ok(none.reads.every((read) => read[2] === 'UNKNOWN' && read[4] === 'not observed'));
  const known = observed('known failure dominates');
  assert.equal(known.impact, 'Synthetic user impact: INTERRUPTED');
  assert.match(known.metrics, /2 observed; 1 passed; 1 failed; 6 unknown/);
  assert.match(known.alert, /History full/);
  assert.equal(known.history.length, 6);
  assert.match(known.history[0][5], /expand, then migrate/);
  const cap = observed('twelve-event');
  assert.equal(cap.trace.length, 12);
  assert.match(cap.alert, /Event limit/);
});

test('actual keyboard focus, reset, small viewport, enforced CSP and awaited cleanup passed on the qualified offline pair', () => {
  assert.deepEqual(browser.keyboardFocusStyle, { style: 'solid', width: '3px' });
  assert.equal(browser.smallViewport.width, 320);
  assert.equal(browser.smallViewport.noPageHorizontalOverflow, true);
  for (const reset of browser.observations.filter((entry) => entry.name.startsWith('exact keyboard reset'))) {
    assert.equal(reset.phase, 'Phase: idle');
    assert.equal(reset.gate, 'Contraction gate: not evaluated');
    assert.equal(reset.impact, 'Synthetic user impact: not evaluated');
    assert.equal(reset.metrics, 'No read observations.');
    assert.equal(reset.alert, '');
    assert.equal(reset.focus, 'migration');
    assert.deepEqual(reset.history, [['No attempts yet.']]);
    assert.deepEqual(reset.trace, ['No active attempt.']);
  }
  assert.equal(browser.csp.inlineExecuted, false);
  assert.equal(browser.csp.fetchRejected, true);
  assert.ok(browser.csp.violations.some((entry) => entry.effectiveDirective === 'connect-src'));
  assert.ok(browser.csp.violations.some((entry) => entry.effectiveDirective.startsWith('script-src')));
  assert.ok(browser.csp.violations.every((entry) => entry.disposition === 'enforce'));
  assert.deepEqual(browser.exerciseNetworkRequests, []);
  assert.deepEqual(browser.probeResponses, []);
  assert.deepEqual(browser.pageErrors, []);
  assert.ok(browser.consoleErrors.every((entry) => entry.stage === 'csp-probes'));
  assert.deepEqual(browser.cleanup, { sessionCloseAwaited: true, serversStarted: 0, foregroundLeaseUsed: false });
  const tooling = json(evidence('tooling.json'));
  assert.equal(tooling.node, 'v22.23.4');
  assert.equal(tooling.playwright, '1.56.1');
  assert.equal(tooling.edge.version, browser.browserVersion);
  assert.equal(tooling.edge.signatureStatus, 'Valid');
  assert.match(tooling.edge.signer, /Microsoft Corporation/);
  assert.equal(sha(raw(evidence('tooling-signature.raw.gz'))), tooling.signatureRawSha256);
  assert.equal(tooling.helperPublication, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
  assert.equal(tooling.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(sha(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))), tooling.helperSha256);
  for (const key of ['installedOrDownloaded', 'unsafeFlags', 'productionNode24Certified',
    'nativeOrSourceParentCertified', 'unattendedLifecycleCertified']) assert.equal(tooling[key], false);
});

test('focused verification streams retain raw hashes, genuine test outcomes and syntax command provenance', () => {
  const directory = path.join(root, 'evidence', 'verification');
  const reports = fs.readdirSync(directory).filter((entry) =>
    fs.existsSync(path.join(directory, entry, 'run.json')));
  for (const name of ['green-001', 'browser-001', 'syntax-001']) assert.ok(reports.includes(name));
  for (const name of reports) {
    const report = json(evidence('verification', name, 'run.json'));
    assert.equal(report.cardId, 'A-S054');
    assert.equal(report.exitCode, 0, name);
    assert.equal(report.failed, 0, name);
    assert.equal(report.missingCodeOrTools, false, name);
    assert.ok(report.spawnErrors.every((entry) => entry === null), name);
    assert.ok(report.signals.every((entry) => entry === null), name);
    assert.equal(sha(raw(evidence('verification', name, 'stdout.raw.gz'))), report.rawStdoutSha256, name);
    assert.equal(sha(raw(evidence('verification', name, 'stderr.raw.gz'))), report.rawStderrSha256, name);
    if (report.mode !== 'syntax') assert.ok(report.passed > 0, name);
    else {
      assert.equal(report.commands.length, 8);
      assert.ok(report.commands.every((command) => command[1] === '--check'));
    }
  }
  assert.equal(json(evidence('verification', 'green-001', 'run.json')).passed, 30);
  assert.equal(json(evidence('verification', 'browser-001', 'run.json')).passed, 1);
});

test('active source canonical Git bytes and published blobs match while raw binary proof remains unchanged', () => {
  const ledger = json(evidence('source-integrity.json'));
  assert.equal(ledger.cardId, 'A-S054');
  assert.equal(ledger.entries.length, 14);
  const head = git('rev-parse', 'HEAD').toString().trim();
  const tracked = git('ls-tree', '-r', '--name-only', head, '--', 'learning/S054').toString().trim();
  if (process.env.REQUIRE_PUBLISHED_SOURCE === '1') assert.ok(tracked, 'Published owned source must exist in Git.');
  for (const entry of ledger.entries) {
    const current = canonical(bytes(entry.source));
    assert.equal(sha(current), entry.canonicalSha256, entry.source);
    const oid = crypto.createHash('sha1').update(`blob ${current.length}\0`).update(current).digest('hex');
    assert.equal(oid, entry.gitBlobOid, entry.source);
    if (tracked) {
      const committed = git('show', `${head}:learning/S054/${entry.source.replace(/\\/g, '/')}`);
      assert.equal(sha(committed), entry.canonicalSha256, `Published canonical ${entry.source}`);
    }
  }
  const snapshots = [
    ...source.entries.map((entry) => evidence(entry.snapshot)),
    ...['red', 'red-002'].flatMap((directory) =>
      json(evidence(directory, 'run.json')).snapshots.map((entry) => evidence(directory, entry.snapshot))),
  ];
  for (const snapshot of snapshots) {
    const gitPath = `learning/S054/${snapshot.replace(/\\/g, '/')}`;
    const attribute = git('check-attr', 'text', '--', gitPath).toString();
    assert.match(attribute, /text: unset/);
    if (tracked) assert.deepEqual(git('show', `${head}:${gitPath}`), bytes(snapshot), snapshot);
  }
});
