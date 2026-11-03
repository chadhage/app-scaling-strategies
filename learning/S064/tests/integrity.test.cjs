'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const folder = path.resolve(__dirname, '..');
const repo = path.resolve(folder, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const owned = (relative) => {
  const file = path.resolve(folder, ...relative.split(/[\\/]/));
  assert.ok(file.startsWith(`${folder}${path.sep}`), relative);
  return file;
};
const raw = (relative) => fs.readFileSync(owned(relative));
const json = (relative) => JSON.parse(raw(relative).toString('utf8'));
const index = () => json('evidence\\integrity-002.json');
const receipt = (label) => json(path.join('evidence', 'raw', label, 'run.json'));
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    assert.equal(entry.isSymbolicLink(), false);
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [path.relative(folder, file)];
  });
}

test('integrity index covers the entire owned bundle except its exact self-references', () => {
  const proof = index();
  assert.equal(proof.cardId, 'A-S064');
  assert.equal(proof.kanoUnit, 'A-S064');
  assert.deepEqual(proof.exclusions.sort(), [
    path.join('evidence', 'integrity-002.json'),
    ...['stdout.txt', 'stderr.txt', 'run.json'].map((name) => path.join('evidence', 'raw', 'integrity-002', name)),
  ].sort());
  assert.deepEqual(proof.files.map((entry) => entry.path).sort(), walk(folder).filter((file) => !proof.exclusions.includes(file)).sort());
  assert.ok(proof.files.length >= 60);
});

test('raw proof bytes and canonical source match actual Git filters and unchanged indexed blobs', () => {
  const tracked = new Map(
    execFileSync('git', ['ls-files', '--stage', '--', 'learning\\S064'], { cwd: repo, encoding: 'utf8' })
      .split(/\r?\n/).filter(Boolean).map((line) => {
        const match = line.match(/^\d+ ([a-f0-9]{40}) 0\t(.+)$/);
        assert.ok(match, line);
        return [match[2].replace(/\//g, path.sep), match[1]];
      }),
  );
  const pending = new Set(
    execFileSync('git', ['diff', '--name-only', '--', 'learning\\S064'], { cwd: repo, encoding: 'utf8' })
      .split(/\r?\n/).filter(Boolean).map((file) => file.replace(/\//g, path.sep)),
  );
  for (const entry of index().files) {
    assert.equal(path.isAbsolute(entry.path), false);
    const file = owned(entry.path);
    const bytes = fs.readFileSync(file);
    const proof = entry.path.startsWith(`evidence${path.sep}`);
    const qualified = proof ? bytes : canonical(bytes);
    assert.equal(entry.mode, proof ? 'raw-proof-bytes' : 'canonical-lf-git-source', entry.path);
    assert.equal(qualified.length, entry.bytes, entry.path);
    assert.equal(hash(qualified), entry.sha256, entry.path);
    const filteredHash = execFileSync('git', ['hash-object', `--path=${path.basename(file)}`, file], {
      cwd: path.dirname(file), encoding: 'utf8', windowsHide: true,
    }).trim();
    assert.equal(filteredHash, entry.gitBlobSha1, `${entry.path}: actual Git filter`);
    const relative = path.join('learning', 'S064', entry.path);
    if (tracked.has(relative) && !pending.has(relative)) assert.equal(tracked.get(relative), entry.gitBlobSha1, `${entry.path}: indexed content`);
  }
});

test('source excerpts preserve original bytes, exact acceptance, packet and parent boundaries', () => {
  const source = json('evidence\\source-contract.json');
  const manifest = json('manifest.json');
  assert.equal(source.objective, manifest.objective);
  assert.equal(source.sourceAcceptance, manifest.exactSourceBehavior);
  assert.equal(source.parentAcceptance, manifest.exactParentAcceptance);
  assert.equal(source.packet, 'SC-S064');
  assert.equal(source.kanoUnit, 'A-S064');
  assert.equal(source.sources.length, 9);
  for (const entry of source.sources) {
    const bytes = raw(entry.snapshot);
    assert.equal(bytes.length, entry.bytes);
    assert.equal(hash(bytes), entry.sha256);
    assert.equal(hash(canonical(bytes)), entry.canonicalSha256);
    assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, entry.crlfPairs);
    assert.ok(entry.crlfPairs >= 1, entry.snapshot);
    assert.match(entry.sourceRawSha256AtRead, /^[a-f0-9]{64}$/);
    assert.match(entry.sourceCanonicalSha256AtRead, /^[a-f0-9]{64}$/);
  }
  assert.match(raw('evidence\\raw\\source\\source-readme.snapshot').toString('utf8'), /^\| S064 \| \*\*New shard introduction:\*\*/);
  assert.match(raw('evidence\\raw\\source\\source-backlog.snapshot').toString('utf8'), /Committed data is copied\/synchronized before handoff; fencing prevents missing or duplicate writes/);
  assert.match(raw('evidence\\raw\\source\\source-card.snapshot').toString('utf8'), /Assign a new shard before\/after synchronization; reject ambiguous writer ownership/);
  assert.match(raw('evidence\\raw\\source\\source-packet-rule.snapshot').toString('utf8'), /every other A\/B card belongs to SC-Snnn/);
  assert.match(raw('evidence\\raw\\source\\source-parent-rule.snapshot').toString('utf8'), /A-only completion.*does not establish a native demo/);
  assert.match(raw('evidence\\raw\\source\\source-native.snapshot').toString('utf8'), /B-S064.*prepared-shard handoff/);
  assert.match(raw('.gitattributes').toString('utf8'), /evidence\/\*\* -text/);
});

test('retained RED is a loadable semantic assertion failure and precedes explicit IaC N/A and green', () => {
  const red = receipt('red');
  assert.equal(red.exitCode, 1);
  assert.equal(red.expectedExitCode, 1);
  const stdout = raw(red.stdout.file).toString('utf8');
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /expected: 'success'/);
  assert.match(stdout, /actual: 'unknown'/);
  assert.doesNotMatch(stdout + raw(red.stderr.file).toString('utf8'), /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError/);
  const context = { module: { exports: {} } };
  vm.runInNewContext(raw('evidence\\red\\model.js.snapshot').toString('utf8'), context, { timeout: 1000 });
  const stub = context.module.exports;
  assert.equal(stub.run(stub.createState(), stub.DEFAULTS).history[0].verdict, 'unknown');
  assert.match(raw('evidence\\red\\model.test.cjs.snapshot').toString('utf8'), /assert\.equal\(result\.verdict, 'success'/);
  const rawFeature = raw('evidence\\red\\shard-handoff.feature.snapshot');
  const gitFeature = execFileSync('git', ['show', 'HEAD:learning/S064/shard-handoff.feature'], { cwd: repo });
  assert.notEqual(hash(rawFeature), hash(canonical(rawFeature)), 'Original CRLF proof must remain byte-exact, not silently normalized');
  assert.equal(hash(canonical(rawFeature)), hash(canonical(raw('shard-handoff.feature'))));
  assert.equal(hash(canonical(rawFeature)), hash(gitFeature), 'The retained feature must also qualify the canonical LF Git blob');
  const iac = json('evidence\\iac-stage.json');
  assert.equal(iac.status, 'N/A');
  assert.ok(Date.parse(receipt('red-snapshots').finishedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(iac.recordedAtUtc));
  assert.ok(Date.parse(iac.recordedAtUtc) <= Date.parse(receipt('green').startedAtUtc));
  assert.equal(receipt('green').exitCode, 0);
  assert.equal(receipt('syntax').exitCode, 0);
  assert.equal(receipt('green-002').exitCode, 0);
  assert.equal(receipt('syntax-002').exitCode, 0);
  assert.equal(receipt('canonical-source').exitCode, 0);
  assert.equal(walk(path.join(folder, 'evidence', 'red')).some((name) => /\.(?:js|cjs)$/.test(name)), false);
});

test('every retained raw execution stream matches its receipt and diagnostic failures are explicit', () => {
  const receipts = walk(path.join(folder, 'evidence', 'raw')).filter((name) => name.endsWith(`${path.sep}run.json`));
  assert.ok(receipts.length >= 11);
  for (const file of receipts) {
    const run = json(file);
    assert.equal(run.cardId, 'A-S064');
    assert.equal(run.workerId, 'worker-A-S064');
    assert.equal(run.processError, null, file);
    assert.equal(run.signal, null, file);
    assert.ok(Array.isArray(run.command) && run.command.length >= 2);
    assert.match(run.recorderCanonicalSha256, /^[a-f0-9]{64}$/);
    assert.ok(Date.parse(run.startedAtUtc) <= Date.parse(run.finishedAtUtc));
    for (const stream of [run.stdout, run.stderr]) {
      const bytes = raw(stream.file);
      assert.equal(bytes.length, stream.bytes, stream.file);
      assert.equal(hash(bytes), stream.sha256, stream.file);
    }
    if (run.exitCode !== run.expectedExitCode) {
      assert.equal(run.label, 'tooling', 'No other unqualified command failure is permitted');
      assert.equal(run.exitCode, 1);
      assert.match(raw(run.stderr.file).toString('utf8'), /Microsoft\.PowerShell\.Security/);
    }
  }
  assert.equal(receipt('tooling-002').exitCode, 0);
  assert.equal(receipt('browser-diagnostic').exitCode, 1);
  assert.equal(receipt('browser-diagnostic').expectedExitCode, 1);
  assert.match(raw(receipt('browser-diagnostic').stdout.file).toString('utf8'), /loaded\.some/);
  const cspDiagnostic = JSON.parse(raw(receipt('csp-diagnostic').stdout.file).toString('utf8'));
  assert.equal(cspDiagnostic.csp.evalRan, true, 'Preserved invalid DevTools probe must not be relabeled as CSP enforcement');
  assert.equal(cspDiagnostic.csp.evalBlocked, false);
  assert.equal(receipt('lf-diagnostic').exitCode, 1);
  assert.equal(receipt('lf-diagnostic').expectedExitCode, 1);
  assert.match(raw(receipt('lf-diagnostic').stderr.file).toString('utf8'), /Raw proof must remain exact/);
});

test('existing offline runtime and Microsoft-signed Edge match only the published helper qualification', () => {
  const tooling = json('evidence\\tooling.json');
  const signature = json(tooling.edgeSignature);
  assert.equal(tooling.node, 'v22.23.4');
  assert.equal(tooling.playwrightVersion, '1.56.1');
  assert.equal(tooling.helperPublication, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
  assert.equal(tooling.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(hash(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))), tooling.helperSha256);
  assert.equal(signature.status, 'Valid');
  assert.match(signature.signer, /Microsoft Corporation/);
  assert.equal(signature.version, '156.0.4314.50');
  assert.match(signature.sha256, /^[a-f0-9]{64}$/);
  assert.equal(tooling.installed, false);
  assert.equal(tooling.downloaded, false);
  assert.deepEqual(tooling.unsafeFlags, []);
  assert.match(tooling.lifecycle, /prototype is unqualified/);
});

test('retained actual browser proof qualifies current sources, twelve real checks, enforced CSP and cleanup', () => {
  const browser = json('evidence\\raw\\browser\\observations.json');
  assert.equal(receipt('browser').exitCode, 0);
  assert.equal(receipt('browser').browserCaptureAuthorized, true);
  assert.equal(browser.captureAuthorized, true);
  assert.equal(browser.completed, true);
  assert.equal(browser.checks.length, 12);
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.equal(browser.node, 'v22.23.4');
  assert.equal(browser.browserVersion, '156.0.4314.50');
  assert.equal(browser.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(browser.helperPublication, '53c0c0d');
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.externalRequests, []);
  assert.ok(browser.requests.every((url) => url.startsWith('file:') || url === 'data:text/plain,synthetic-csp-probe'));
  assert.match(browser.cleanup, /Awaited close\(\) in finally.*cleanup completed/);
  for (const [file, expected] of Object.entries(browser.canonicalSourceSha256)) assert.equal(hash(canonical(raw(file))), expected, file);
  assert.equal(hash(canonical(raw('tests\\browser.test.cjs'))), browser.browserTestCanonicalSha256);
  assert.equal(browser.artifacts.length, 12);
  for (const artifact of browser.artifacts) {
    const bytes = raw(artifact.file);
    assert.equal(bytes.length, artifact.bytes);
    assert.equal(hash(bytes), artifact.sha256);
  }
  assert.equal(browser.csp.inlineRan, false);
  assert.equal(browser.csp.evalRan, false);
  assert.equal(browser.csp.evalBlocked, true);
  assert.equal(browser.csp.connectionBlocked, true);
  for (const blockedURI of ['inline', 'eval', 'data']) assert.ok(browser.csp.violations.some((entry) => entry.blockedURI === blockedURI));
  assert.match(raw('evidence\\raw\\browser\\ambiguous-writer-failure.dom.html.snapshot').toString('utf8'), /FAILURE — assignment blocked/);
  assert.match(raw('evidence\\raw\\browser\\unknown.dom.html.snapshot').toString('utf8'), /UNKNOWN — assignment blocked/);
});
