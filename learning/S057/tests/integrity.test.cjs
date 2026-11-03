'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { gunzipSync } = require('node:zlib');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const bytes = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(bytes(file));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const lf = (value) => Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n'));

test('sealed raw evidence and canonical LF sources retain their exact identities', () => {
  const seal = json('evidence\\integrity.json');
  assert.equal(seal.cardId, 'A-S057');
  assert.ok(seal.files.length >= 30);
  for (const entry of seal.files) {
    assert.ok(!path.isAbsolute(entry.path) && !entry.path.split(/[\\/]/).includes('..'));
    assert.equal(hash(entry.kind === 'raw' ? bytes(entry.path) : lf(bytes(entry.path))), entry.sha256, entry.path);
  }
  for (const file of ['model.js', 'app.js', 'index.html', 'tests\\model.test.cjs', 'evidence\\red\\model.js.snapshot', 'evidence\\red\\run.tap']) {
    const entry = seal.files.find((item) => item.path === file);
    assert.ok(entry, file);
    const relative = path.relative(repo, path.join(root, file)).replaceAll('\\', '/');
    const canonical = spawnSync('git', ['hash-object', `--path=${relative}`, path.join(root, file)], { cwd: repo, encoding: 'utf8' });
    assert.equal(canonical.status, 0);
    assert.equal(canonical.stdout.trim(), entry.gitBlobSha1, `${file} canonical Git blob`);
  }
});

test('RED is genuine behavior failure, with untouched raw CRLF snapshots and replayable stub', () => {
  const record = json('evidence\\red\\run.json');
  assert.equal(record.exitCode, 1);
  assert.equal(record.error, null);
  const stdout = gunzipSync(bytes('evidence\\red\\run.stdout.raw.gz'));
  const stderr = gunzipSync(bytes('evidence\\red\\run.stderr.raw.gz'));
  assert.equal(hash(stdout), record.stdoutSha256);
  assert.equal(hash(stderr), record.stderrSha256);
  assert.deepEqual(stdout, bytes('evidence\\red\\run.tap'));
  assert.match(stdout.toString(), /expected: 'success'[\s\S]*?actual: 'unknown'/);
  assert.match(stdout.toString(), /# pass 1/);
  assert.match(stdout.toString(), /# fail 13/);
  assert.equal((stdout.toString().match(/code: 'ERR_ASSERTION'/g) || []).length, 13);
  assert.ok(!/MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError/.test(stdout.toString()));
  for (const item of record.snapshots) {
    const raw = bytes(item.snapshot);
    assert.equal(hash(raw), item.rawSha256, item.snapshot);
    assert.equal(hash(lf(raw)), item.lfSha256, item.snapshot);
    assert.equal((raw.toString().match(/\r\n/g) || []).length, item.crlfCount);
    assert.ok(item.crlfCount > 0);
  }
  const module = { exports: {} };
  vm.runInNewContext(bytes('evidence\\red\\model.js.snapshot').toString(), { module });
  const api = module.exports;
  let state = api.transition(api.createState(), 'start', { ...api.DEFAULTS });
  for (const action of ['deploy', 'load-old', 'load-new']) state = api.transition(state, action);
  assert.equal(api.inspect(state).phase, 'complete');
  assert.equal(api.inspect(state).outcome, 'unknown');
  assert.deepEqual(lf(bytes('static-assets.feature')), lf(bytes('evidence\\red\\static-assets.feature.snapshot')));
  assert.deepEqual(lf(bytes('tests\\model.test.cjs')), lf(bytes('evidence\\red\\model.test.cjs.snapshot')));
  assert.notEqual(hash(lf(bytes('model.js'))), hash(lf(bytes('evidence\\red\\model.js.snapshot'))));
});

test('exact source acceptance, portable contract and packet remain qualified against canonical Git source', () => {
  const source = json('evidence\\source-contract.json');
  assert.equal(source.readBeforeBehaviorDesign, true);
  assert.equal(source.packet, 'SC-S057');
  assert.equal(source.kanoUnit, 'A-S057');
  assert.equal(source.sourceParentComplete, false);
  assert.equal(source.nativeSiblingComplete, false);
  assert.deepEqual(source.packetSource.cards.map((card) => card.id), ['A-S057', 'B-S057']);
  assert.equal(source.packetSource.cards[0].deliver, 'Load old HTML after deployment; detect asset retirement that breaks an existing page.');
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

test('IaC N/A follows assertion RED, and approved tooling makes no production or native claim', () => {
  const red = json('evidence\\red\\run.json');
  const iac = json('evidence\\iac.json');
  const seal = json('evidence\\integrity.json');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.beforeImplementation, true);
  assert.equal(iac.afterBehavioralRed, red.completedAtUtc);
  assert.ok(Date.parse(red.completedAtUtc) <= Date.parse(iac.decidedAtUtc));
  assert.ok(Date.parse(iac.decidedAtUtc) < Date.parse(seal.createdAtUtc));
  const tooling = json('evidence\\tooling.json');
  assert.equal(tooling.node, 'v22.23.4');
  assert.equal(tooling.playwright, '1.56.1');
  assert.match(tooling.edgeVersion, /^156\./);
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signer, /Microsoft Corporation/);
  for (const key of ['downloads', 'installs', 'unsafeFlags', 'productionNode24Certified', 'nativeOrCloudCertified']) assert.equal(tooling[key], false);
});

test('Git attributes keep raw provenance binary while ordinary sources are LF text', () => {
  const files = ['model.js', 'evidence\\red\\model.js.snapshot', 'evidence\\red\\run.stdout.raw.gz', 'evidence\\red\\run.tap'];
  const paths = files.map((file) => `learning/S057/${file.replaceAll('\\', '/')}`);
  const result = spawnSync('git', ['check-attr', '-z', 'text', 'eol', 'diff', '--', ...paths], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0);
  const fields = result.stdout.split('\0').slice(0, -1);
  const attributes = new Map();
  for (let index = 0; index < fields.length; index += 3) {
    attributes.set(`${fields[index]}:${fields[index + 1]}`, fields[index + 2]);
  }
  assert.equal(attributes.get(`${paths[0]}:text`), 'set');
  assert.equal(attributes.get(`${paths[0]}:eol`), 'lf');
  for (const file of paths.slice(1)) {
    assert.equal(attributes.get(`${file}:text`), 'unset');
    assert.equal(attributes.get(`${file}:diff`), 'unset');
  }
});

test('final syntax qualification covers the unchanged current JavaScript sources', () => {
  const report = json('evidence\\syntax-final.json');
  assert.equal(report.passed, true);
  assert.equal(report.node, 'v22.23.4');
  assert.equal(report.checks.length, 8);
  for (const entry of report.checks) {
    assert.equal(entry.exitCode, 0, entry.file);
    assert.equal(entry.stderr, '');
    assert.equal(hash(lf(bytes(entry.file))), entry.lfSha256, entry.file);
  }
});

test('qualified actual browser proof matches current source, exact helper, real CSP and completed cleanup', () => {
  const report = json('evidence\\browser.json');
  assert.equal(report.passed, true);
  assert.equal(report.cardId, 'A-S057');
  assert.equal(report.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(report.helperPublication, '53c0c0d');
  assert.equal(report.playwrightVersion, '1.56.1');
  assert.match(report.browserVersion, /^156\./);
  assert.equal(report.cleanup.awaitedFinallyClose, true);
  assert.equal(report.cleanup.pageClosed, true);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.exerciseNetworkRequests, []);
  assert.deepEqual(report.escapedProbeRequests, []);
  assert.ok(report.observations.length >= 18);
  assert.ok(report.observations.some((item) => item.dom.outcome === 'failure'));
  assert.ok(report.observations.some((item) => /withheld/.test(item.label) && item.dom.outcome === 'unknown'));
  const directives = report.csp.violations.map((item) => item.directive);
  for (const expected of ['script-src-elem', 'script-src-attr', 'script-src', 'connect-src', 'form-action']) assert.ok(directives.includes(expected));
  for (const entry of report.sources) assert.equal(hash(lf(bytes(entry.path))), entry.lfSha256, entry.path);
});

test('all deliberate capture attempts retain raw logs; qualified browser snapshots match current tests', () => {
  const correction = json('evidence\\attribute-check-correction.json');
  const archived = bytes(`evidence\\${correction.sourceSnapshot}`);
  assert.equal(hash(archived), correction.rawSha256);
  const priorSeal = json('evidence\\integrity-001.json').files.find((item) => item.path === 'tests\\integrity.test.cjs');
  assert.equal(hash(lf(archived)), priorSeal.sha256);
  const priorSyntax = json('evidence\\syntax-before-attribute-fix.json').checks.find((item) => item.file === 'tests\\integrity.test.cjs');
  assert.equal(hash(lf(archived)), priorSyntax.lfSha256);
  const names = fs.readdirSync(path.join(root, 'evidence')).filter((name) => /^(browser|focused)-run-\d{3}\.json$/.test(name)).sort();
  assert.ok(names.some((name) => name.startsWith('browser')));
  const qualified = json('evidence\\browser.json').qualifiedRun;
  for (const name of names) {
    const prefix = `evidence\\${name.replace(/\.json$/, '')}`;
    const record = json(`evidence\\${name}`);
    const stdout = gunzipSync(bytes(`${prefix}.stdout.raw.gz`));
    const stderr = gunzipSync(bytes(`${prefix}.stderr.raw.gz`));
    assert.equal(hash(stdout), record.stdoutSha256);
    assert.equal(hash(stderr), record.stderrSha256);
    assert.deepEqual(stdout, bytes(`${prefix}.tap`));
    for (const item of record.snapshots) {
      assert.equal(hash(bytes(item.snapshot)), item.rawSha256);
      assert.equal(hash(lf(bytes(item.snapshot))), item.lfSha256);
      if (name === `${qualified}.json`) assert.equal(hash(lf(bytes(item.source))), item.lfSha256);
    }
    if (name === `${qualified}.json`) {
      assert.equal(record.exitCode, 0);
      assert.equal(json(`${prefix}.observations.json`).passed, true);
    }
  }
});
