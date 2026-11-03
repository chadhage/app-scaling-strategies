'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const bytes = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(bytes(file));
const lf = (value) => Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n'));
const hash = (value) => createHash('sha256').update(value).digest('hex');

test('all sealed source and raw-evidence hashes qualify Git LF without changing raw CRLF', () => {
  const seal = json('evidence\\integrity.json');
  assert.equal(seal.cardId, 'A-S052');
  assert.ok(seal.files.length >= 30);
  for (const entry of seal.files) {
    assert.ok(!path.isAbsolute(entry.path) && !entry.path.split(/[\\/]/).includes('..'));
    const raw = bytes(entry.path);
    assert.equal(hash(entry.kind === 'raw' ? raw : lf(raw)), entry.sha256, entry.path);
  }
  assert.ok(seal.files.some((entry) => entry.kind === 'raw' && entry.path.endsWith('model.js.snapshot')));
  assert.ok(seal.files.some((entry) => entry.kind === 'git-source-lf' && entry.path === 'model.js'));
});

test('retained RED is a real assertion result with exact raw stdout, stderr and snapshots', () => {
  const record = json('evidence\\red\\run.json');
  assert.equal(record.exitCode, 1);
  assert.equal(record.error, null);
  const stdout = gunzipSync(bytes('evidence\\red\\run.stdout.raw.gz'));
  const stderr = gunzipSync(bytes('evidence\\red\\run.stderr.raw.gz'));
  assert.equal(hash(stdout), record.stdoutSha256);
  assert.equal(hash(stderr), record.stderrSha256);
  assert.deepEqual(stdout, bytes('evidence\\red\\run.tap'));
  assert.match(stdout.toString(), /expected: 'success'[\s\S]*?actual: 'unknown'/);
  assert.match(stdout.toString(), /# pass 2/);
  assert.match(stdout.toString(), /# fail 14/);
  assert.equal((stdout.toString().match(/code: 'ERR_ASSERTION'/g) || []).length, 14);
  assert.ok(!/MODULE_NOT_FOUND|SyntaxError|ReferenceError|ERR_TEST_FAILURE/.test(stdout.toString()));
  for (const item of record.snapshots) {
    const raw = bytes(item.snapshot);
    assert.equal(hash(raw), item.rawSha256, item.snapshot);
    assert.equal(hash(lf(raw)), item.lfSha256, item.snapshot);
    assert.equal((raw.toString().match(/\r\n/g) || []).length, item.crlfCount);
    assert.ok(item.crlfCount > 0);
  }
});

test('retained stub independently loads and reproduces the original unknown-not-success behavior', () => {
  const module = { exports: {} };
  vm.runInNewContext(bytes('evidence\\red\\model.js.snapshot').toString(), { module });
  const api = module.exports;
  let state = api.transition(api.createState(), 'start', { ...api.DEFAULTS });
  for (let index = 0; index < 4; index += 1) state = api.transition(state, 'step');
  assert.equal(state.current.outcome, 'unknown');
  assert.equal(state.phase, 'complete');
  assert.deepEqual(lf(bytes('new-frontend.feature')), lf(bytes('evidence\\red\\new-frontend.feature.snapshot')));
  assert.deepEqual(lf(bytes('tests\\model.test.cjs')), lf(bytes('evidence\\red\\model.test.cjs.snapshot')));
  assert.notEqual(hash(lf(bytes('model.js'))), hash(lf(bytes('evidence\\red\\model.js.snapshot'))));
});

test('exact source/contract sections still match canonical Git source and preserve packet identity', () => {
  const source = json('evidence\\source-contract.json');
  assert.equal(source.readBeforeBehaviorDesign, true);
  assert.equal(source.packet, 'SC-S052');
  assert.deepEqual(source.packetSource.cards.map((card) => card.id), ['A-S052', 'B-S052']);
  assert.equal(source.packetSource.cards[0].deliver, 'Send new-frontend requests to old APIs; reject success for unavailable required features.');
  for (const entry of source.sources) {
    const raw = bytes(`evidence\\${entry.snapshot}`);
    assert.equal(hash(raw), entry.rawSha256);
    assert.equal(hash(lf(raw)), entry.lfSha256);
    const canonical = spawnSync('git', ['show', `${entry.head}:${entry.path.replaceAll('\\', '/')}`], { cwd: repo });
    assert.equal(canonical.status, 0);
    assert.equal(hash(canonical.stdout), entry.gitSourceSha256);
    assert.ok(lf(canonical.stdout).toString().includes(lf(raw).toString()));
    assert.ok(lf(fs.readFileSync(path.join(repo, entry.path))).toString().includes(lf(raw).toString()));
  }
});

test('IaC decision follows qualified RED and precedes implementation with no inferred authority', () => {
  const red = json('evidence\\red\\run.json');
  const iac = json('evidence\\iac.json');
  const seal = json('evidence\\integrity.json');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.beforeImplementation, true);
  assert.equal(iac.afterBehavioralRed, red.completedAtUtc);
  assert.ok(Date.parse(red.completedAtUtc) <= Date.parse(iac.decidedAtUtc));
  assert.ok(Date.parse(iac.decidedAtUtc) < Date.parse(seal.createdAtUtc));
  assert.match(iac.reason, /No cloud, IaC generation, scaffold, identity registration, deployment or expenditure is authorized/);
});

test('raw evidence remains binary to Git while ordinary sources are explicitly LF text', () => {
  const targets = [
    'learning/S052/model.js', 'learning/S052/evidence/red/model.js.snapshot',
    'learning/S052/evidence/red/run.stdout.raw.gz', 'learning/S052/evidence/red/run.tap',
  ];
  const result = spawnSync('git', ['check-attr', 'text', 'eol', 'diff', '--', ...targets], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /model\.js: text: set/);
  assert.match(result.stdout, /model\.js: eol: lf/);
  for (const suffix of ['model.js.snapshot', 'run.stdout.raw.gz', 'run.tap']) {
    assert.ok(result.stdout.includes(`${suffix}: text: unset`));
    assert.ok(result.stdout.includes(`${suffix}: diff: unset`));
  }
});

test('qualified actual browser evidence uses the pinned helper and completed cleanup', () => {
  const report = json('evidence\\browser.json');
  assert.equal(report.passed, true);
  assert.equal(report.cardId, 'A-S052');
  assert.equal(report.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(report.playwrightVersion, '1.56.1');
  assert.match(report.browserVersion, /^156\./);
  assert.equal(report.cleanup.awaitedFinallyClose, true);
  assert.equal(report.cleanup.pageClosed, true);
  assert.deepEqual(report.pageErrors, []);
  assert.equal(report.exerciseNetworkRequests.length, 0);
  assert.ok(report.observations.length >= 15);
  const directives = report.csp.violations.map((item) => item.directive);
  for (const expected of ['script-src-elem', 'script-src-attr', 'script-src', 'connect-src', 'form-action']) {
    assert.ok(directives.includes(expected), expected);
  }
});

test('all capture attempts preserve raw provenance; only qualified browser proof matches current sources', () => {
  const names = fs.readdirSync(path.join(root, 'evidence')).filter((name) => /^browser-run-\d{3}\.json$/.test(name)).sort();
  assert.ok(names.length >= 3);
  let qualified;
  for (const name of names) {
    const prefix = `evidence\\${name.replace(/\.json$/, '')}`;
    const record = json(`evidence\\${name}`);
    const stdout = gunzipSync(bytes(`${prefix}.stdout.raw.gz`));
    const stderr = gunzipSync(bytes(`${prefix}.stderr.raw.gz`));
    assert.equal(hash(stdout), record.stdoutSha256);
    assert.equal(hash(stderr), record.stderrSha256);
    assert.deepEqual(stdout, bytes(`${prefix}.tap`));
    for (const snapshot of record.snapshots) {
      const raw = bytes(snapshot.snapshot);
      assert.equal(hash(raw), snapshot.rawSha256);
      assert.equal(hash(lf(raw)), snapshot.lfSha256);
    }
    const observations = json(`${prefix}.observations.json`);
    assert.equal(observations.cleanup.awaitedFinallyClose, true);
    assert.equal(observations.cleanup.pageClosed, true);
    if (record.exitCode === 0) {
      assert.equal(observations.passed, true);
      qualified = { record, observations };
    } else {
      assert.equal(observations.passed, false);
      assert.ok(observations.failure.message);
    }
  }
  assert.ok(qualified);
  assert.deepEqual(qualified.observations, json('evidence\\browser.json'));
  for (const snapshot of qualified.record.snapshots) {
    assert.deepEqual(lf(bytes(snapshot.source)), lf(bytes(snapshot.snapshot)));
  }
  assert.equal(json('evidence\\browser-run-001.json').exitCode, 1);
  assert.match(json('evidence\\browser-run-001.observations.json').failure.message, /true !== false/);
  assert.equal(json('evidence\\browser-run-002.json').exitCode, 1);
  assert.match(json('evidence\\browser-run-002.observations.json').failure.message, /navigation to finish/);
});
