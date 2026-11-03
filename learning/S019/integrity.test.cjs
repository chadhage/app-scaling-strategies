'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const json = (name) => JSON.parse(read(name));
const hash = (name) => createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex');
const latest = (prefix) => {
  const names = fs.readdirSync(path.join(__dirname, 'evidence'))
    .filter((name) => new RegExp(`^${prefix}-\\d+\\.json$`).test(name))
    .sort((left, right) => Number(left.match(/(\d+)\.json$/)[1]) - Number(right.match(/(\d+)\.json$/)[1]));
  assert.ok(names.length, `Intentional ${prefix} capture must exist.`);
  return json(path.join('evidence', names.at(-1)));
};
const proofHashes = () => {
  const names = fs.readdirSync(path.join(__dirname, 'evidence')).map((name) => path.join('evidence', name));
  for (const name of ['evidence.json', 'result.json']) if (fs.existsSync(path.join(__dirname, name))) names.push(name);
  return Object.fromEntries(names.sort().map((name) => [name, hash(name)]));
};
const html = read('index.html');
const manifest = json('manifest.json');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';

test('exact canonical S019 source rows, original prerequisites and default packet are preserved', () => {
  const provenance = json(path.join('evidence', 'source-contract.json'));
  const expectedRows = [
    '| S019 | **Cell-based expansion:** Add an isolated application cell and migrate selected tenants through controlled state and routing handoff. |',
    '| D-S019 | P1 | Add **Create cell and move tenant** using isolated capacity and synchronized/fenced state handoff. | Routing and ownership transfer without missing writes; existing cells remain usable; additional capacity is real. | D-S005, D-S064 |',
    '| A-S019 | D-S019 | S | Add a cell and move a tenant; reject routing before synchronized exclusive ownership. | SOURCE |'
  ];
  assert.deepEqual(provenance.sources.map((source) => source.exactRow), expectedRows);
  for (const source of provenance.sources) {
    assert.ok(fs.readFileSync(path.join(root, source.path), 'utf8').includes(source.exactRow));
    assert.match(source.sha256AtRead, /^[0-9a-f]{64}$/);
  }
  assert.deepEqual(manifest.originalPrerequisites, ['D-S005', 'D-S064']);
  assert.deepEqual(provenance.nativeGate, ['CORE', 'DATA', 'HOST', 'FENCE']);
  assert.equal(manifest.packet, 'SC-S019');
  assert.match(provenance.packetRule, /no override/);
});

test('one frozen satisfier has a standalone entry, declared exercise, no dependency and no false credit', () => {
  for (const [field, expected] of Object.entries({
    cardId: 'A-S019', workerId: 'worker-A-S019', kano: 'S', kanoUnit: 'A-S019',
    source: 'S019', parent: 'D-S019', title: 'Cell-based expansion', entryGate: 'SOURCE',
    authorization: 'local-synthetic-only', mode: 'synthetic-only',
    nativeProof: false, parentComplete: false, productionNode24Validated: false
  })) assert.equal(manifest[field], expected, field);
  for (const field of ['objective', 'preconditions', 'actions', 'expectedAssertions', 'limits']) {
    assert.ok(manifest[field].length > 0, field);
  }
  assert.deepEqual(manifest.dependencies, []);
  assert.ok(fs.existsSync(path.join(root, manifest.entryPoint)));
  assert.equal(manifest.testTooling.helperSha256, helperHash);
  assert.equal(manifest.testTooling.helperPublishedCommit, '53c0c0d');
  assert.ok(!fs.readdirSync(__dirname).some((name) => /package(?:-lock)?\.json|\.bicep$|\.tf$/.test(name)));
});

test('exact prominent banner and strict offline CSP use only local external assets', () => {
  assert.match(html, /role="note">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(html.includes(directive), directive);
  }
  assert.doesNotMatch(html, /\bon\w+\s*=|<script(?![^>]*\bsrc=)|\bstyle\s*=|https?:\/\//i);
  const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(assets, ['app.js', 'lesson.css', 'model.js']);
  assert.match(html, /<noscript>/);
  assert.match(read('lesson.css'), /\.training\s*\{/);
});

test('unique labels, keyboard focus, focused errors and callable native reset are explicit', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const controls = [...html.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(controls.length, 2);
  controls.forEach((id) => assert.ok(html.includes(`for="${id}"`), id));
  assert.doesNotMatch(html, /(?:name|id)="reset"/i);
  assert.match(read('app.js'), /form\.reset\(\)/);
  assert.match(read('app.js'), /byId\('input-error'\)\.focus\(\)/);
  assert.match(read('lesson.css'), /:focus-visible/);
  assert.ok(html.includes('role="alert"') && html.includes('aria-live="polite"'));
});

test('genuine behavioral RED and its loadable non-auto-discovered snapshots remain byte-identical', () => {
  const record = json(path.join('evidence', 'red.json'));
  const raw = read(path.join('evidence', record.rawLog));
  assert.equal(record.exitCode, 1);
  assert.equal(record.assertionCode, 'ERR_ASSERTION');
  assert.equal(record.loadableStub, true);
  assert.equal(record.missingCodeOrTools, false);
  assert.equal(record.snapshotsAutoDiscovered, false);
  assert.match(raw, /false !== true/);
  assert.match(raw, /# tests 1/);
  assert.match(raw, /# fail 1/);
  assert.doesNotMatch(raw, /MODULE_NOT_FOUND|SyntaxError|TypeError:/);
  assert.equal(hash(path.join('evidence', record.rawLog)), record.rawLogSha256);
  for (const [name, expected] of Object.entries(record.snapshotHashes)) {
    assert.equal(hash(path.join('evidence', name)), expected);
    assert.ok(name.endsWith('.txt'));
  }
  assert.equal(hash('model.test.cjs'), hash(path.join('evidence', 'red.model.spec.cjs.txt')));
  assert.equal(hash('cell-expansion.feature'), hash(path.join('evidence', 'red.feature.txt')));
  const context = { module: { exports: {} } };
  vm.runInNewContext(read(path.join('evidence', 'red.model.stub.js.txt')), context);
  const stub = context.module.exports;
  assert.equal(stub.act(stub.createRun(), { type: 'create' }).targetCreated, false);
  assert.equal(stub.inspect(stub.createRun()).verdict, 'unknown');
  assert.ok(fs.readdirSync(path.join(__dirname, 'evidence')).every((name) => !/\.(?:test|spec)\.[cm]?js$/.test(name)));
});

test('resource-free IaC N/A follows actual assertion RED, not a tooling failure', () => {
  const red = json(path.join('evidence', 'red.json'));
  const iac = json(path.join('evidence', 'iac-na.json'));
  assert.equal(iac.applicability, 'N/A');
  assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.finishedAtUtc));
  assert.equal(iac.followsBehavioralRed, 'red.json');
  assert.match(iac.reason, /No IaC, cloud resources, identity, deployment, expenditure/);
  assert.notEqual(hash('model.js'), hash(path.join('evidence', 'red.model.stub.js.txt')));
});

test('final focused GREEN and syntax logs identify exact current source bytes', () => {
  for (const prefix of ['green', 'syntax', 'browser']) {
    const record = latest(prefix);
    assert.equal(record.passed, true, prefix);
    assert.equal(record.node, 'v22.23.4');
    assert.equal(record.captureWasExplicit, true);
    assert.equal(hash(path.join('evidence', record.rawLog)), record.rawLogSha256);
    for (const [name, expected] of Object.entries(record.sourceHashes)) assert.equal(hash(name), expected, `${prefix}: ${name}`);
    assert.ok(record.commands.every((command) => command.exitCode === 0 && command.error === null));
  }
  assert.match(read(path.join('evidence', latest('green').rawLog)), /# tests 20/);
  assert.match(read(path.join('evidence', latest('green').rawLog)), /# fail 0/);
  const executable = fs.readdirSync(__dirname).filter((name) => /\.(?:js|cjs)$/.test(name)).sort();
  assert.deepEqual(latest('syntax').syntaxFiles, executable);
});

test('actual signed Edge browser evidence covers DOM, keyboard, errors, reset, failures, unknowns and CSP', () => {
  const observed = latest('browser-observations');
  assert.equal(observed.status, 'passed');
  assert.equal(observed.playwright, '1.56.1');
  assert.equal(observed.helperSha256, helperHash);
  assert.equal(observed.helperPublishedCommit, '53c0c0d');
  assert.equal(observed.signedBrowser.status, 'Valid');
  assert.match(observed.signedBrowser.signer, /Microsoft Corporation/);
  assert.match(observed.browserVersion, /^156\./);
  assert.equal(observed.browserVersion, observed.signedBrowser.productVersion);
  assert.equal(observed.closeAwaited, true);
  assert.deepEqual(observed.pageErrors, []);
  assert.deepEqual(observed.externalCompleted, []);
  assert.equal(observed.cases.length, 10);
  assert.ok(observed.cases.every((entry) => entry.status === 'passed'));
  assert.ok(observed.cases.some((entry) => entry.keyboardOnlyActionSequence === true && entry.dom.verdict === 'success'));
  assert.ok(observed.cases.some((entry) => entry.failureBeforeRecovery && entry.dom.verdict === 'failure'));
  assert.ok(observed.cases.some((entry) => entry.unknownBeforeRecovery && entry.dom.verdict === 'unknown'));
  const csp = observed.cases.find((entry) => entry.csp).csp;
  assert.equal(csp.fetchBlocked, true);
  assert.equal(csp.inlineExecuted, false);
  assert.ok(csp.violations.some((entry) => entry.directive === 'connect-src'));
  assert.ok(csp.violations.some((entry) => entry.directive === 'script-src-elem'));
  for (const [name, expected] of Object.entries(observed.sourceHashes)) assert.equal(hash(name), expected, name);
});

test('all numbered captures retain raw provenance, including unsuccessful runs, without overwriting', () => {
  const names = fs.readdirSync(path.join(__dirname, 'evidence'))
    .filter((name) => /^(?:green|syntax|browser|integrity)-\d+\.json$/.test(name));
  assert.ok(names.length >= 3);
  for (const name of names) {
    const record = json(path.join('evidence', name));
    assert.equal(record.cardId, 'A-S019');
    assert.equal(record.captureWasExplicit, true);
    assert.equal(hash(path.join('evidence', record.rawLog)), record.rawLogSha256);
    assert.ok(Date.parse(record.finishedAtUtc) >= Date.parse(record.startedAtUtc));
  }
  const preflight = json(path.join('evidence', 'publication-preflight-1.json'));
  assert.equal(preflight.authorizedPublicationExitCode, 1);
  assert.equal(preflight.replay.exitCode, 2);
  assert.equal(hash(path.join('evidence', preflight.replay.rawLog)), preflight.replay.rawLogSha256);
});

test('ordinary verification demonstrably preserves every historical proof byte', () => {
  const before = proofHashes();
  const env = { ...process.env };
  delete env.CAPTURE_BROWSER_EVIDENCE;
  const result = spawnSync(process.execPath, [path.join(__dirname, 'verify.cjs'), 'green'], {
    cwd: root, encoding: 'utf8', env, timeout: 30000, windowsHide: true
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /Historical evidence byte hashes unchanged/);
  assert.deepEqual(proofHashes(), before);
});

test('immutable bounded state logic has no clocks, randomness, networking, unsafe DOM or persistence', () => {
  for (const name of ['app.js', 'model.js']) {
    assert.doesNotMatch(read(name), /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|innerHTML|eval\s*\(|setTimeout|setInterval|Date\.|Math\.random/);
  }
  assert.match(read('model.js'), /Object\.freeze/);
  assert.match(read('model.js'), /48 actions/);
  assert.match(read('model.js'), /8 journey batches/);
  assert.match(read('model.js'), /14 acknowledged writes/);
  assert.match(read('app.js'), /archives\.slice\(0, 4\)/);
  assert.match(read('.gitattributes'), /\* -text/);
  assert.match(read('.gitattributes'), /whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol/);
  assert.match(read('.gitattributes'), /evidence\/\*\.tap\.txt -whitespace/);
});

test('documented native remainder and ignored actual publication receipt do not self-Accept or invent units', () => {
  const evidence = json('evidence.json');
  for (const record of [manifest, evidence]) {
    assert.equal(record.nativeProof, false);
    assert.equal(record.parentComplete, false);
    assert.equal(record.kanoUnit, 'A-S019');
    assert.equal(record.kano, 'S');
  }
  for (const phrase of ['B-S019 remains To Do, gated by CORE, DATA, HOST, FENCE',
    'D-S005 and D-S064', 'five-nines', 'production Node.js 24', 'page memory only']) assert.ok(html.includes(phrase), phrase);
  assert.match(read('README.md'), /No extra A-S019 test\/plumbing\/refinement unit/);
  assert.equal(read('.gitignore').trim(), 'result.json');
  if (fs.existsSync(path.join(__dirname, 'result.json'))) {
    const receipt = json('result.json');
    assert.equal(receipt.cardId, 'A-S019');
    assert.equal(receipt.workerId, 'worker-A-S019');
    assert.equal(receipt.kanoUnit, 'A-S019');
    assert.equal(receipt.nativeProof, false);
    assert.equal(receipt.parentComplete, false);
    assert.equal(receipt.acceptedAtUtc, null);
    if (receipt.outcome === 'published') {
      assert.match(receipt.commit, /^[0-9a-f]{40}$/);
      assert.equal(receipt.tag, `kanban/A-S019/${receipt.commit.slice(0, 12)}`);
      assert.equal(receipt.remoteVerified, true);
    }
  }
});
