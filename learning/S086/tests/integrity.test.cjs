'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { slices, sha, allFiles, canonical } = require('.\\capture.cjs');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, ...file.split('/')));
const json = (file) => JSON.parse(read(file).toString('utf8'));
const source = json('evidence/source-contract.json');
function git(args, input) {
  const result = spawnSync('git', args, { cwd: repo, input, windowsHide: true });
  assert.equal(result.status, 0, `Read-only git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

test('raw CRLF source and canonical Git baseline are preserved and exactly qualified', () => {
  assert.equal(source.cardId, 'A-S086');
  assert.equal(source.packet, 'SC-S086');
  assert.equal(source.kano, 'S');
  for (const observation of source.observations) {
    const working = zlib.gunzipSync(read(observation.workingSnapshot));
    const baseline = zlib.gunzipSync(read(observation.gitSnapshot));
    assert.equal(sha(working), observation.workingSHA256);
    assert.equal(sha(baseline), observation.gitSHA256);
    assert.ok(observation.workingCRLF > 0);
    assert.equal((working.toString('utf8').match(/\r\n/g) || []).length, observation.workingCRLF);
    assert.equal(baseline.toString('utf8').includes('\r\n'), false);
    assert.deepEqual(git(['show', `${source.baseline}:${observation.path}`]), baseline);
    assert.deepEqual(slices(observation.path, working), observation.exactSlices);
    assert.deepEqual(slices(observation.path, baseline), observation.exactSlices);
    const current = fs.readFileSync(path.join(repo, ...observation.path.split('/')));
    assert.deepEqual(slices(observation.path, current), observation.exactSlices);
  }
});

test('exact source acceptance, portable contract, atomic sequence and SC packet remain authoritative', () => {
  const [readme, backlog, kanban] = source.observations.map((item) => item.exactSlices);
  assert.equal(readme.S086, '| S086 | **Expired readiness evidence:** Revalidate health before promotion when readiness information becomes stale. |');
  assert.equal(backlog.D_S086, '| D-S086 | P0 | Add **Expire readiness evidence before promotion**. | Stale observations trigger revalidation or safe rejection; promotion cannot reuse an invalid health snapshot. | D-S021 |');
  assert.equal(kanban.A_S086, '| A-S086 | D-S086 | S | Expire readiness before promotion; force revalidation instead of trusting an old green snapshot. | SOURCE |');
  assert.match(kanban.B_S086, /CORE, DATA, HOST/);
  assert.match(kanban.atomic, /genuine behavioral TDD red/);
  assert.match(kanban.portable, /standalone, browser-openable/);
  assert.match(kanban.portable, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(kanban.packet, /every other A\/B card belongs to SC-Snnn/);
  assert.match(kanban.sourceGate, /supplied backlog and portable lesson contract/);
  assert.match(backlog.completion, /Unknown started outcomes cannot be excluded/);
});

test('original non-discovered RED snapshots reproduce genuine assertion provenance', () => {
  const red = json('evidence/red.json');
  const output = read(red.stdout);
  assert.equal(sha(output), red.stdoutSHA256);
  assert.equal(sha(read(red.stderr)), red.stderrSHA256);
  assert.equal(read(red.stderr).length, 0);
  assert.equal(red.exitCode, 1);
  assert.deepEqual(red.summary, { tests: 18, pass: 1, fail: 17, cancelled: 0, skipped: 0 });
  assert.equal(red.genuineAssertionFailures, 17);
  assert.equal((output.toString('utf8').match(/code: 'ERR_ASSERTION'/g) || []).length, 17);
  assert.doesNotMatch(output.toString('utf8'), /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|ReferenceError|SyntaxError/);
  for (const file of ['readiness.feature', 'fixtures.js', 'tests/model.test.cjs']) {
    const snapshot = read(`evidence/red/${file.replaceAll('/', '-')}.snapshot`);
    assert.deepEqual(canonical(file, read(file)), canonical(file, snapshot));
  }
  const stub = read('evidence/red/model.js.snapshot');
  assert.notDeepEqual(canonical('model.js', read('model.js')), canonical('model.js', stub));
  const context = { module: { exports: {} } };
  vm.runInNewContext(stub.toString('utf8'), context, { timeout: 1000 });
  assert.equal(typeof context.module.exports.createLesson, 'function');
  assert.equal(context.module.exports.createLesson().snapshot().phase, 'idle');
  for (const file of fs.readdirSync(path.join(root, 'evidence', 'red'))) assert.ok(file.endsWith('.snapshot'));
});

test('resource-free IaC decision follows RED and precedes implemented GREEN', () => {
  const iac = json('evidence/iac-decision.json');
  const red = json('evidence/red.json');
  const green = json('evidence/green.json');
  assert.equal(iac.decision, 'N/A');
  assert.equal(iac.afterRed, red.finishedAtUtc);
  assert.ok(Date.parse(source.capturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) < Date.parse(iac.recordedAtUtc));
  assert.ok(Date.parse(iac.recordedAtUtc) < Date.parse(green.startedAtUtc));
  assert.match(iac.reason, /no cloud, IaC, scaffold, identity, credentials, deployment or expenditure/i);
});

test('only the exact published browser helper and approved offline tooling were used', () => {
  const tooling = json('evidence/tooling.json');
  assert.equal(tooling.node, 'v22.23.4');
  assert.equal(tooling.playwright, '1.56.1');
  assert.equal(tooling.edge.version, '156.0.4314.50');
  assert.equal(tooling.edge.signatureStatus, 'Valid');
  assert.match(tooling.edge.signer, /Microsoft Corporation/);
  assert.equal(tooling.helperCommit, '53c0c0d');
  assert.equal(tooling.helperSHA256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(sha(read('evidence/raw/tooling.stdout')), tooling.stdoutSHA256);
  assert.equal(sha(read('evidence/raw/tooling.stderr')), tooling.stderrSHA256);
  const helper = fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(sha(helper), tooling.helperSHA256);
  assert.deepEqual(canonical('isolated.cjs', helper), git(['show', '53c0c0d:testing/browser/isolated.cjs']));
  assert.match(tooling.qualification, /no packages, downloads, unsafe flags, foreground lease/);
});

test('captured actual browser evidence covers twelve groups, six CSP denials and awaited cleanup', () => {
  const browser = json('evidence/browser.json');
  assert.equal(browser.cardId, 'A-S086');
  assert.equal(browser.captureEnvironment, 'CAPTURE_BROWSER_EVIDENCE=1');
  assert.equal(browser.awaitedFinallyClose, true);
  assert.equal(browser.groups.length, 12);
  assert.ok(browser.groups.every((group) => group.result === 'PASS'));
  assert.deepEqual(browser.pageErrors, []);
  const directives = browser.cspViolations.map((item) => item.directive);
  for (const directive of ['script-src-elem', 'style-src-elem', 'connect-src', 'frame-src', 'worker-src', 'form-action']) {
    assert.ok(directives.includes(directive));
  }
  assert.equal(browser.screenshots.length, 6);
  for (const screenshot of browser.screenshots) {
    const png = read(`evidence/${screenshot.file}`);
    assert.equal(sha(png), screenshot.sha256);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
  assert.match(browser.qualification, /No native, production24 or source-parent certification/);
});

test('raw GREEN and syntax provenance records no failures, cancellations or skipped checks', () => {
  const green = json('evidence/green.json');
  assert.equal(green.exitCode, 0);
  assert.deepEqual(green.summary, { tests: 37, pass: 37, fail: 0, cancelled: 0, skipped: 0 });
  assert.equal(sha(read(green.stdout)), green.stdoutSHA256);
  assert.equal(sha(read(green.stderr)), green.stderrSHA256);
  assert.equal(read(green.stderr).length, 0);
  const syntax = json('evidence/syntax-final.json');
  const scripts = allFiles().filter((file) => /\.(js|cjs)$/.test(file)).map((file) => path.relative(root, file)).sort();
  assert.equal(syntax.allPassed, true);
  assert.deepEqual(syntax.checks.map((check) => check.file).sort(), scripts);
  assert.ok(syntax.checks.every((check) => check.exitCode === 0));
  assert.equal(read('evidence/raw/syntax-final.stdout').length, 0);
  assert.equal(read('evidence/raw/syntax-final.stderr').length, 0);
});

test('complete owned integrity is canonical for Git text and byte-exact for raw proof, without writes', () => {
  const index = json('evidence/content-index-final.json');
  const expectedFiles = allFiles().map((file) => path.relative(root, file).replaceAll('\\', '/'))
    .filter((file) => file !== 'evidence/content-index-final.json').sort();
  assert.deepEqual(index.files.map((file) => file.path).sort(), expectedFiles);
  for (const entry of index.files) {
    const bytes = read(entry.path);
    const clean = canonical(entry.path, bytes);
    assert.equal(sha(clean), entry.sha256, entry.path);
    const object = crypto.createHash('sha1').update(`blob ${clean.length}\0`).update(clean).digest('hex');
    assert.equal(object, entry.gitCleanObject, `Canonical Git object: ${entry.path}`);
    const actual = git(['hash-object', `--path=learning/S086/${entry.path}`, '--stdin'], bytes).toString('utf8').trim();
    assert.equal(actual, entry.gitCleanObject, `Working clean-filter integrity: ${entry.path}`);
    if (/^evidence\/(?:raw|red)\//.test(entry.path) || entry.path.endsWith('.png')) {
      assert.equal(entry.representation, 'byte-exact', entry.path);
      const attribute = git(['check-attr', 'text', '--', `learning/S086/${entry.path}`]).toString('utf8');
      assert.match(attribute, /: text: unset/);
    } else assert.equal(entry.representation, 'canonical-LF');
  }
  const preflight = json('evidence/publication-preflight.json');
  assert.equal(preflight.exitCode, 2);
  assert.equal(sha(read(preflight.stdout)), preflight.stdoutSHA256);
  assert.equal(sha(read(preflight.stderr)), preflight.stderrSHA256);
  assert.match(read(preflight.stdout).toString('utf8'), /trailing whitespace/);
  assert.equal(sha(read(preflight.originalIndex)), preflight.originalIndexSHA256);
  assert.equal(index.supersedes.sha256, preflight.originalIndexSHA256);
  const recovered = new Map(preflight.workingSnapshots.map((entry) => {
    const bytes = zlib.gunzipSync(read(entry.snapshot));
    assert.equal(sha(bytes), entry.rawSHA256);
    assert.equal(sha(canonical(entry.path, bytes)), entry.canonicalSHA256);
    return [entry.path, bytes];
  }));
  for (const original of json(preflight.originalIndex).files) {
    const bytes = recovered.get(original.path) || read(original.path);
    const clean = canonical(original.path, bytes);
    assert.equal(sha(clean), original.sha256, `Preserved preflight index: ${original.path}`);
    const object = crypto.createHash('sha1').update(`blob ${clean.length}\0`).update(clean).digest('hex');
    assert.equal(object, original.gitCleanObject, `Preserved preflight Git object: ${original.path}`);
  }
  assert.match(read('.gitattributes').toString('utf8'), /evidence\/raw\/\*\* -text -whitespace/);
  assert.match(read('.gitattributes').toString('utf8'), /evidence\/red\/\*\* -text -whitespace/);
});
