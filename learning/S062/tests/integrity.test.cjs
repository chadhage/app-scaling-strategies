'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const bytes = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(bytes(file));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const lf = (value) => Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n'));
const blob = (value) => createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex');

test('exact source acceptance, portable contract and packet qualify against committed canonical source', () => {
  const source = json('evidence\\source-contract.json');
  assert.equal(source.cardId, 'A-S062');
  assert.equal(source.parentId, 'D-S062');
  assert.equal(source.packet, 'SC-S062');
  assert.equal(source.kanoUnit, 'A-S062');
  assert.equal(source.readBeforeBehaviorDesign, true);
  assert.equal(source.sourceParentComplete, false);
  assert.equal(source.nativeSiblingComplete, false);
  assert.equal(source.sources.length, 7);
  for (const entry of source.sources) {
    const raw = bytes(entry.snapshot);
    assert.equal(hash(raw), entry.rawSha256, entry.snapshot);
    assert.equal(hash(lf(raw)), entry.lfSha256, entry.snapshot);
    assert.equal((raw.toString().match(/\r\n/g) || []).length, entry.crlfCount);
    assert.ok(entry.crlfCount > 0, 'Raw source CRLF is preserved, not reconstituted from LF');
    const committed = spawnSync('git', ['show', `${entry.head}:${entry.path.replaceAll('\\', '/')}`], { cwd: repo });
    assert.equal(committed.status, 0);
    assert.equal(hash(committed.stdout), entry.canonicalGitSourceSha256, entry.path);
    assert.ok(lf(committed.stdout).toString().includes(lf(raw).toString()));
    assert.ok(lf(fs.readFileSync(path.join(repo, entry.path))).toString().includes(lf(raw).toString()));
  }
  assert.match(bytes('evidence\\raw\\source-readme-row.snapshot').toString(), /Keep aggregate database connections within limits as frontend\/API instance counts increase/);
  assert.match(bytes('evidence\\raw\\source-backlog-row.snapshot').toString(), /Total connections stay within the approved data-tier limit; connection exhaustion and journey latency are detected/);
  assert.match(bytes('evidence\\raw\\source-card-pair.snapshot').toString(), /\| A-S062 \| D-S062 \| S \| Multiply per-instance pools during scaling; detect aggregate database-connection exhaustion/);
  assert.match(bytes('evidence\\raw\\source-card-pair.snapshot').toString(), /\| B-S062 \|.*CORE, DATA, ASANY, C065/);
  assert.match(bytes('evidence\\raw\\source-packet-rule.snapshot').toString(), /every other A\/B card belongs to SC-Snnn/);
});

test('genuine loadable-stub RED retains raw snapshots and assertion failures, not tooling failure', () => {
  const red = json('evidence\\red\\run.json');
  const stdout = bytes('evidence\\red\\run.tap');
  const stderr = bytes('evidence\\red\\run.stderr.raw');
  assert.equal(red.exitCode, 1);
  assert.equal(red.signal, null);
  assert.equal(red.error, null);
  assert.equal(hash(stdout), red.stdoutSha256);
  assert.equal(hash(stderr), red.stderrSha256);
  assert.match(stdout.toString(), /# tests 14/);
  assert.match(stdout.toString(), /# pass 1/);
  assert.match(stdout.toString(), /# fail 13/);
  assert.equal((stdout.toString().match(/code: 'ERR_ASSERTION'/g) || []).length, 13);
  assert.match(stdout.toString(), /expected: 'success'[\s\S]*?actual: 'unknown'/);
  assert.ok(!/MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError:/.test(stdout.toString()));
  for (const entry of red.snapshots) {
    const raw = bytes(entry.snapshot);
    assert.equal(hash(raw), entry.rawSha256, entry.snapshot);
    assert.equal(hash(lf(raw)), entry.lfSha256, entry.snapshot);
    assert.equal((raw.toString().match(/\r\n/g) || []).length, entry.crlfCount);
    assert.ok(entry.crlfCount > 0);
    assert.match(entry.snapshot, /\.snapshot$/);
  }
  for (const file of ['connection-pools.feature', 'model.test.cjs']) {
    const current = file.endsWith('.cjs') ? `tests\\${file}` : file;
    assert.deepEqual(lf(bytes(current)), lf(bytes(`evidence\\red\\${file}.snapshot`)));
  }
  const module = { exports: {} };
  vm.runInNewContext(bytes('evidence\\red\\model.js.snapshot').toString(), { module });
  const stub = module.exports;
  const complete = stub.transition(stub.transition(stub.createState(), 'baseline', { ...stub.DEFAULTS }), 'scale');
  assert.equal(stub.inspect(complete).phase, 'complete');
  assert.equal(stub.inspect(complete).outcome, 'unknown');
  assert.notEqual(hash(lf(bytes('model.js'))), hash(lf(bytes('evidence\\red\\model.js.snapshot'))));
});

test('IaC decision follows qualified behavioral RED and precedes implementation qualification', () => {
  const red = json('evidence\\red\\run.json');
  const iac = json('evidence\\iac.json');
  const seal = json('evidence\\integrity.json');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.beforeImplementation, true);
  assert.equal(iac.afterBehavioralRed, red.completedAtUtc);
  assert.ok(Date.parse(iac.decidedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.ok(Date.parse(iac.decidedAtUtc) < Date.parse(seal.createdAtUtc));
  assert.equal(iac.productionOrNativeProof, false);
});

test('approved offline tooling is exact, signed and explicitly not native or production certification', () => {
  const tooling = json('evidence\\tooling.json');
  assert.equal(tooling.node, 'v22.23.4');
  assert.equal(tooling.playwright, '1.56.1');
  assert.equal(tooling.edgeVersion, '156.0.4314.50');
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signer, /Microsoft Corporation/);
  assert.equal(tooling.helperPublication, '53c0c0d');
  assert.equal(tooling.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(hash(fs.readFileSync(path.join(repo, tooling.helper))), tooling.helperSha256);
  for (const key of ['downloads', 'installs', 'unsafeFlags', 'productionNode24Certified', 'nativeOrCloudCertified']) assert.equal(tooling[key], false);
});

test('narrow owned Git attributes retain exact raw CRLF while ordinary sources are canonical LF text', () => {
  const files = ['model.js', 'evidence\\red\\model.js.snapshot', 'evidence\\red\\run.tap', 'evidence\\raw\\source-readme-row.snapshot'];
  const paths = files.map((file) => `learning/S062/${file.replaceAll('\\', '/')}`);
  const result = spawnSync('git', ['check-attr', '-z', 'text', 'eol', 'diff', '--', ...paths], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0);
  const fields = result.stdout.split('\0').slice(0, -1);
  const attributes = new Map();
  for (let index = 0; index < fields.length; index += 3) attributes.set(`${fields[index]}:${fields[index + 1]}`, fields[index + 2]);
  assert.equal(attributes.get(`${paths[0]}:text`), 'set');
  assert.equal(attributes.get(`${paths[0]}:eol`), 'lf');
  for (const file of paths.slice(1)) {
    assert.equal(attributes.get(`${file}:text`), 'unset');
    assert.equal(attributes.get(`${file}:diff`), 'unset');
  }
  const seal = json('evidence\\integrity.json');
  for (let index = 0; index < files.length; index += 1) {
    const result = spawnSync('git', ['hash-object', `--path=${paths[index]}`, path.join(root, files[index])], { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), seal.files.find((entry) => entry.path === files[index]).gitBlobSha1);
  }
});

test('integrity seal qualifies exact raw evidence and canonical Git-source identities without self-reference', () => {
  const seal = json('evidence\\integrity.json');
  assert.equal(seal.cardId, 'A-S062');
  assert.ok(seal.files.length >= 30);
  assert.equal(new Set(seal.files.map((entry) => entry.path)).size, seal.files.length);
  for (const entry of seal.files) {
    assert.ok(!path.isAbsolute(entry.path) && !entry.path.split(/[\\/]/).includes('..'));
    assert.notEqual(entry.path, 'evidence\\integrity.json');
    const raw = bytes(entry.path);
    const canonical = entry.kind === 'raw' ? raw : lf(raw);
    assert.equal(hash(canonical), entry.sha256, entry.path);
    assert.equal(blob(canonical), entry.gitBlobSha1, `${entry.path} canonical Git blob identity`);
  }
  for (const file of ['index.html', 'app.js', 'model.js', 'styles.css', 'manifest.json', 'README.md', '.gitattributes', 'tests\\integrity.test.cjs', 'evidence\\syntax.json', 'evidence\\red\\run.tap']) {
    assert.ok(seal.files.some((entry) => entry.path === file), file);
  }
});

test('syntax qualification covers every current JavaScript source unchanged', () => {
  const syntax = json('evidence\\syntax.json');
  assert.equal(syntax.passed, true);
  assert.equal(syntax.node, 'v22.23.4');
  assert.equal(syntax.checks.length, 8);
  for (const entry of syntax.checks) {
    assert.equal(entry.exitCode, 0, entry.file);
    assert.equal(entry.error, null);
    assert.equal(entry.stderr, '');
    assert.equal(hash(lf(bytes(entry.file))), entry.lfSha256, entry.file);
  }
});

test('actual browser evidence matches current sources, complete DOM cases, restrictive CSP and awaited cleanup', () => {
  const filenames = fs.readdirSync(path.join(root, 'evidence')).filter((file) => /^browser-run-\d{3}\.observations\.json$/.test(file)).sort();
  assert.ok(filenames.length >= 1);
  const passed = filenames.map((file) => ({ file, report: json(`evidence\\${file}`) })).filter(({ report }) => report.passed);
  assert.ok(passed.length >= 1, 'A real passing capture is required; failures are not green proof');
  const { report, file } = passed.at(-1);
  assert.equal(report.cardId, 'A-S062');
  assert.equal(report.executionMode, 'synthetic');
  assert.equal(report.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(report.helperPublication, '53c0c0d');
  assert.equal(report.node, 'v22.23.4');
  assert.equal(report.playwrightVersion, '1.56.1');
  assert.match(report.browserVersion, /^156\./);
  assert.equal(report.cleanup.awaitedFinallyClose, true);
  assert.equal(report.cleanup.pageClosed, true);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.exerciseNetworkRequests, []);
  assert.deepEqual(report.escapedProbeRequests, []);
  for (const entry of report.sources) assert.equal(hash(lf(bytes(entry.path))), entry.lfSha256, entry.path);
  assert.equal(report.sources.length, 7);
  assert.ok(report.observations.length >= 18);
  const doms = report.observations.map((observation) => observation.dom);
  const exhaustion = doms.find((dom) => dom.outcome === 'failure' && dom.trace[1].text.includes('20 refused'));
  assert.ok(exhaustion);
  assert.match(exhaustion.trace[1].text, /140 requested \/ 120 limit.*514 ms/);
  const unknown = doms.find((dom) => dom.outcome === 'unknown' && dom.trace[1].text.includes('140 requested'));
  assert.ok(unknown);
  assert.match(unknown.trace[1].text, /unknown accepted.*unknown refused.*unknown ms/);
  assert.ok(doms.some((dom) => dom.history.length === 6 && dom.buttons.again));
  const final = doms.at(-1);
  assert.equal(final.history.length, 0);
  assert.equal(final.outcome, 'unknown');
  assert.equal(final.error, '');
  assert.equal(final.activeElement, 'frontendInstances');
  assert.equal(final.nativeFormReset, 'function');
  assert.equal(report.csp.externalProbeLoaded, true);
  assert.equal(report.csp.inlineRan, false);
  assert.equal(report.csp.fetchRejected, true);
  for (const directive of ['script-src-elem', 'connect-src', 'form-action']) {
    assert.ok(report.csp.violations.some((violation) => violation.directive === directive), directive);
  }
  const run = json(`evidence\\${report.qualifiedRun}.json`);
  assert.equal(run.exitCode, 0);
  assert.equal(run.error, null);
  assert.equal(hash(bytes(`evidence\\${report.qualifiedRun}.tap`)), run.stdoutSha256);
  assert.equal(hash(bytes(`evidence\\${report.qualifiedRun}.stderr.raw`)), run.stderrSha256);
  assert.ok(json('evidence\\integrity.json').files.some((entry) => entry.path === `evidence\\${file}`));
});
