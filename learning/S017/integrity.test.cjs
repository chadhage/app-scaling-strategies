'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const directory = __dirname;
const root = path.resolve(directory, '..', '..');
const evidence = path.join(directory, 'evidence');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (name) => fs.readFileSync(path.join(directory, name));
const text = (name) => read(name).toString('utf8');
const json = (name) => JSON.parse(read(name));
const manifest = json('manifest.json');
const stub = json('evidence\\stub-1.json');
const red = json('evidence\\red-1.json');
const iac = json('evidence\\iac-na.json');
function latest(stage) {
  const names = fs.readdirSync(evidence).filter((name) => new RegExp(`^${stage}-\\d+\\.json$`).test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  assert.ok(names.length, `${stage} evidence required`);
  return json(path.join('evidence', names.at(-1)));
}
function browser() {
  const names = fs.readdirSync(evidence).filter((name) => /^browser-\d+-observations\.json$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  assert.ok(names.length, 'actual browser observations required');
  return json(path.join('evidence', names.at(-1)));
}
function bundleHashes() {
  return Object.fromEntries(fs.readdirSync(directory, { recursive: true })
    .filter((name) => fs.statSync(path.join(directory, name)).isFile() && name !== 'result.json')
    .sort().map((name) => [name, sha(read(name))]));
}

test('one frozen S unit, source parent and packet; no native completion', () => {
  for (const record of [manifest, json('evidence.json'), stub, red, iac, browser()]) {
    assert.equal(record.cardId, 'A-S017');
    assert.equal(record.kano, 'S');
    assert.equal(record.kanoUnit, 'A-S017');
    assert.equal(record.packet, 'SC-S017');
  }
  assert.equal(manifest.parent, 'D-S017');
  assert.equal(manifest.source, 'S017');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.deepEqual(manifest.originalPrerequisites, ['P001', 'D-S001']);
  assert.deepEqual(manifest.dependencies, []);
  for (const record of [manifest, json('evidence.json'), iac, browser()]) {
    assert.equal(record.nativeProof, false);
    assert.equal(record.parentComplete, false);
    assert.equal(record.productionNode24Validated, false);
  }
});

test('canonical S017, backlog comparison and portable contracts match the declared scope', () => {
  const source = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const backlog = fs.readFileSync(path.join(root, '.docs', 'wiki', 'backlog.md'), 'utf8');
  const kanban = fs.readFileSync(path.join(root, '.docs', 'wiki', 'kanban.md'), 'utf8');
  assert.ok(source.includes('| S017 | **Vertical scaling through replacement:** Prepare a larger parallel deployment when an in-place size change would violate continuity requirements. |'));
  assert.ok(backlog.includes('| D-S017 | P1 | Add **Replace with larger capacity** beside **In-place resize** as a clearly labeled comparison. | Parallel capacity is ready before handoff; continuity and cost are compared; disruptive in-place outcomes are reported honestly. | P001, D-S001 |'));
  assert.ok(kanban.includes('| A-S017 | D-S017 | S | Compare in-place resize with ready parallel replacement; expose both cost and disruption tradeoffs. | SOURCE |'));
  assert.match(kanban, /### Portable A-card lesson contract/);
  assert.match(kanban, /every other A\/B card belongs to SC-Snnn/);
  for (const key of ['README', 'backlog', 'kanban']) assert.match(iac.sourceReadBeforeDesign[key].sha256, /^[a-f0-9]{64}$/);
});

test('BDD preceded an actual loadable no-op stub and executable assertion RED', () => {
  assert.equal(stub.stage, 'stub');
  assert.equal(stub.outcome, 'PASS');
  assert.equal(stub.passed, true);
  assert.match(fs.readFileSync(path.join(evidence, stub.raw.stdout.path), 'utf8'), /Loadable no-op stub/);
  assert.equal(red.outcome, 'EXPECTED_BEHAVIORAL_RED');
  assert.equal(red.passed, true);
  assert.equal(red.commands[0].exitCode, 1);
  assert.deepEqual(red.counts, { tests: 55, pass: 1, fail: 54, cancelled: 0, skipped: 0 });
  const raw = fs.readFileSync(path.join(evidence, red.raw.stdout.path), 'utf8');
  assert.equal((raw.match(/code: 'ERR_ASSERTION'/g) || []).length, 54);
  assert.doesNotMatch(raw, /MODULE_NOT_FOUND|SyntaxError|TypeError:|ReferenceError:/);
  assert.match(text('vertical-replacement.feature'), /Scenario: Compare the same demand and observation horizon/);
});

test('raw RED snapshots are exact, retained and not automatically discoverable tests', () => {
  for (const record of [stub, red]) {
    for (const [name, snapshot] of Object.entries(record.snapshots)) {
      assert.match(snapshot.path, /\.txt$/);
      assert.ok(snapshot.path.startsWith(`red${path.sep}`));
      const bytes = fs.readFileSync(path.join(evidence, snapshot.path));
      assert.equal(sha(bytes), snapshot.sha256);
      assert.equal(snapshot.sha256, record.sourceHashes[name]);
    }
  }
  assert.equal(sha(read('model.test.cjs')), red.sourceHashes['model.test.cjs'], 'The original RED assertions are unchanged');
  assert.notEqual(sha(read('model.js')), red.sourceHashes['model.js']);
  assert.ok(fs.readdirSync(path.join(evidence, 'red')).every((name) => name.endsWith('.txt')));
});

test('IaC N/A is explicit after RED and before implementation/green', () => {
  assert.equal(iac.result, 'N/A');
  assert.match(iac.reason, /Resource-free standalone synthetic/);
  assert.equal(iac.preImplementationModelSha256, red.sourceHashes['model.js']);
  assert.ok(Date.parse(stub.finishedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(iac.recordedAtUtc));
  const firstGreen = json('evidence\\green-1.json');
  assert.ok(Date.parse(iac.recordedAtUtc) < Date.parse(firstGreen.startedAtUtc));
});

test('every stage preserves raw stdout/stderr hashes and real process results', () => {
  const records = fs.readdirSync(evidence).filter((name) => /^(?:stub|red|green|syntax|browser|integrity)-\d+\.json$/.test(name));
  for (const name of records) {
    const record = json(path.join('evidence', name));
    assert.equal(record.captureWasExplicit, true);
    assert.match(record.node, /^v22\./);
    assert.ok(Date.parse(record.finishedAtUtc) >= Date.parse(record.startedAtUtc));
    for (const kind of ['stdout', 'stderr']) {
      const raw = record.raw[kind];
      assert.equal(path.isAbsolute(raw.path), false);
      assert.equal(path.dirname(raw.path), '.');
      assert.equal(sha(fs.readFileSync(path.join(evidence, raw.path))), raw.sha256);
    }
    for (const command of record.commands) {
      assert.equal(typeof command.exitCode, 'number');
      assert.equal(command.error, null);
      assert.equal(command.signal, null);
    }
  }
});

test('latest focused green proves the original 55 behaviors against current model bytes', () => {
  const green = latest('green');
  assert.equal(green.passed, true);
  assert.deepEqual(green.counts, { tests: 55, pass: 55, fail: 0, cancelled: 0, skipped: 0 });
  for (const name of ['model.js', 'model.test.cjs']) assert.equal(green.sourceHashes[name], sha(read(name)));
});

test('latest syntax covers every owned executable file, including the integrity suite', () => {
  const syntax = latest('syntax');
  assert.equal(syntax.passed, true);
  const names = fs.readdirSync(directory).filter((name) => /\.(?:js|cjs)$/.test(name)).sort();
  assert.equal(names.length, 6);
  assert.deepEqual(syntax.syntaxFiles, names);
  for (const name of names) assert.equal(syntax.sourceHashes[name], sha(read(name)));
  assert.ok(syntax.commands.every((command) => command.exitCode === 0));
});

test('qualified actual browser lineage pins the published helper and signed installed Edge', () => {
  const observations = browser();
  assert.equal(observations.status, 'PASS');
  assert.equal(observations.helperCommit, '53c0c0d');
  assert.equal(observations.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(sha(fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'))), observations.helperSha256);
  assert.equal(observations.playwright, '1.56.1');
  assert.equal(observations.signedBrowser.status, 'Valid');
  assert.match(observations.signedBrowser.signer, /Microsoft Corporation/);
  assert.match(observations.browserVersion, /^156\./);
  assert.equal(observations.browserVersion, observations.signedBrowser.productVersion);
  assert.equal(observations.closeAwaited, true);
  assert.match(text('browser.test.cjs'), /finally[\s\S]*await session\.close\(\)/);
});

test('browser observations are current, complete, zero-skip actual conducting checks', () => {
  const observations = browser();
  assert.equal(observations.cases.length, 16);
  assert.ok(observations.cases.every((entry) => entry.status === 'PASS'));
  for (const [name, hash] of Object.entries(observations.sourceHashes)) assert.equal(hash, sha(read(name)));
  const stage = latest('browser');
  assert.equal(stage.passed, true);
  assert.deepEqual(stage.counts, { tests: 17, pass: 17, fail: 0, cancelled: 0, skipped: 0 });
  assert.deepEqual(observations.pageErrors, []);
  assert.deepEqual(observations.consoleErrors.filter((entry) => !entry.expectedCspProbe), []);
  assert.deepEqual(observations.externalCompleted, []);
  assert.deepEqual(observations.interceptedProbeRequests, []);
});

test('actual matched-horizon browser outcomes include disruption, overlap cost and retained failures', () => {
  const cases = browser().cases;
  const inplace = cases.find((entry) => /real Tab/.test(entry.name)).observation;
  const comparison = cases.find((entry) => /fresh observed readiness/.test(entry.name)).observation;
  assert.equal(inplace.interrupted, 4);
  assert.equal(inplace.costCredits, 6);
  assert.equal(comparison.replacement.costCredits, 9);
  assert.equal(comparison.replacement.targetSuccessful, 4);
  assert.equal(comparison.replacement.successful, 12);
  assert.equal(comparison.replacement.elapsedSeconds, inplace.elapsedSeconds);
  assert.equal(comparison.retainedInPlace.verification, 'FAIL');
  assert.equal(cases.find((entry) => /missing data remains/.test(entry.name)).observation.verification, 'UNKNOWN');
  assert.equal(cases.find((entry) => /failed candidate/.test(entry.name)).observation.userImpact, 'safe-abort-before-exposure');
});

test('actual browser error/reset and bounded-history proof is retained', () => {
  const cases = browser().cases;
  assert.equal(cases.find((entry) => /unexpected runtime error/.test(entry.name)).observation.recovered, true);
  assert.match(cases.find((entry) => /unexpected runtime error/.test(entry.name)).observation.archivedError.message, /Deliberate S017/);
  assert.deepEqual(cases.find((entry) => /window, command and archive bounds/.test(entry.name)).observation,
    { archiveCount: 4, retainedWindowCount: 12, retainedCommandCount: 40, noPruning: true });
});

test('actual enforced CSP proves inline code, handlers, styles, connections and forms blocked', () => {
  const observation = browser().cases.find((entry) => /actual CSP/.test(entry.name)).observation;
  assert.equal(observation.inlineRan, false);
  assert.equal(observation.handlerRan, false);
  assert.equal(observation.inlineStyle, '');
  for (const directive of ['script-src-elem', 'script-src-attr', 'style-src-elem', 'connect-src', 'form-action']) {
    assert.ok(observation.violations.some((entry) => entry.directive === directive));
  }
  const html = text('index.html');
  for (const policy of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(html.includes(policy));
  }
});

test('portable browser and CommonJS exports need no framework or management API', () => {
  const model = require('./model.js');
  assert.equal(model.summarize(model.initial()).verification, 'NOT_RUN');
  const context = {};
  vm.runInNewContext(text('model.js'), context);
  assert.equal(typeof context.S017Model.reduce, 'function');
  assert.equal(vm.runInNewContext('S017Model.summarize(S017Model.initial()).verification', context), 'NOT_RUN');
  assert.doesNotMatch(text('app.js') + text('model.js'), /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|innerHTML|\beval\s*\(|new Function/);
  assert.doesNotMatch(text('index.html'), /(?:id|name)="reset"|<script[^>]*>[^<]+<\/script>|<style|on(?:click|load|submit)=/i);
  assert.equal(manifest.entryPoint, 'learning\\S017\\index.html');
});

test('independent ordinary verification is dynamically read-only to the historical bundle', () => {
  const before = bundleHashes();
  const env = { ...process.env };
  delete env.CAPTURE_BROWSER_EVIDENCE;
  const result = spawnSync(process.execPath, [path.join(directory, 'verify.cjs'), 'green'], {
    cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 30000
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /read-only verification/);
  assert.deepEqual(bundleHashes(), before);
});

test('published bytes are protected from checkout line-ending rewriting', () => {
  assert.match(text('.gitattributes'), /^\* -text /);
  assert.match(text('.gitignore'), /^\/result\.json$/m);
  const result = spawnSync('git', ['check-attr', 'text', '--', 'learning\\S017\\model.js', 'learning\\S017\\evidence\\red-1.stdout.txt'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stdout.match(/text: unset/g) || []).length, 2);
  assert.ok(!fs.readdirSync(directory).some((name) => /(?:\.bicep|\.tf|\.tfvars|Dockerfile|package\.json)$/i.test(name)));
});
