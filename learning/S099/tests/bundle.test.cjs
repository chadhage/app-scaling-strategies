'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative));
const json = relative => JSON.parse(read(relative));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));

function git(args) {
  const result = spawnSync('git', ['--no-pager', ...args], { cwd: repo, maxBuffer: 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}

function gitBlobHash(bytes) {
  return crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
}

function gitTreePath(file) {
  // Git attribute/tree identifiers are not Windows filesystem paths.
  return path.relative(repo, file).split(path.sep).join('/');
}

test('manifest preserves exact source, inventory objective and one frozen portable S unit', () => {
  const manifest = json('manifest.json');
  for (const [key, value] of Object.entries({
    schemaVersion: 1, sourceId: 'S099', cardId: 'A-S099', parentId: 'D-S099', packet: 'SC-S099',
    kano: 'S', kanoUnit: 'A-S099', technicalEntryGate: 'SOURCE', owner: 'worker-A-S099',
    objective: 'Fail rollback itself; reject a blindly repeated reversal with unknown effective routing.',
    banner: 'Training rehearsal - synthetic data - not a live Azure result', entry: 'index.html', mode: 'synthetic'
  })) assert.equal(manifest[key], value);
  for (const key of ['preconditions', 'actions', 'expectedAssertions', 'limits']) assert.ok(manifest[key].length > 0);
  assert.equal(manifest.acceptance.acceptedAtUtc, null);
  assert.match(manifest.acceptance.nativeSibling, /D-S098/);
  assert.equal(manifest.syntheticInputs.maxRehearsals, 4);
  assert.equal(manifest.syntheticInputs.maxChoicesPerRehearsal, 8);
  assert.equal(manifest.syntheticInputs.maxIssuedRollbackCommandsPerRehearsal, 1);
  assert.equal(manifest.syntheticInputs.maxIssuedReconciliationsPerRehearsal, 1);
});

test('exact source acceptance and packet provenance match immutable Git blobs', () => {
  const source = json('evidence\\source-contract.json');
  assert.equal(source.inventory.objective, undefined);
  assert.equal(source.inventory.deliver, json('manifest.json').objective);
  assert.equal(source.inventory.packet, 'SC-S099');
  assert.equal(source.claim.authorization, 'local-synthetic-only');
  assert.equal(source.claim.owner, 'worker-A-S099');
  assert.equal(source.sourceAcceptance, 'The controller reconciles effective routing and preserves known-good service; an uncertain reversal is not declared complete.');
  assert.match(source.portableContract, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(source.packetRule, /every other A\/B card belongs to SC-Snnn/);
  for (const file of source.sourceFiles) {
    const bytes = git(['cat-file', 'blob', file.gitBlobOid]);
    assert.equal(sha(bytes), file.gitBlobSha256);
    assert.ok(bytes.toString('utf8').split(/\r?\n/).includes(file.exactRow));
  }
  assert.match(source.sourceFiles[0].exactRow, /Inspect effective state and preserve known-good routing rather than blindly reversing again/);
  assert.match(source.sourceFiles[1].exactRow, /\| D-S098 \|$/);
});

test('RED is a loadable wrong-behavior assertion with byte-preserved non-discovered snapshots before IaC N/A', () => {
  const red = json('evidence\\red.json');
  const iac = json('evidence\\iac-decision.json');
  const source = json('evidence\\source-contract.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.snapshotsAutoDiscovered, false);
  for (const key of ['stdout', 'stderr', 'stub', 'assertions']) {
    const record = red[key];
    const bytes = read(path.join('evidence', record.path));
    assert.equal(sha(bytes), record.sha256);
    assert.ok(record.path.endsWith('.txt'));
  }
  const stdout = read(path.join('evidence', red.stdout.path)).toString();
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /actual: 'success'/);
  assert.match(stdout, /expected: 'failure'/);
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|SyntaxError/);
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(read(path.join('evidence', red.stub.path)).toString(), sandbox);
  const stub = sandbox.module.exports;
  assert.equal(typeof stub.startRun, 'function');
  assert.equal(stub.current(stub.startRun(stub.createState(), 'failed-before-apply')).commandStatus, 'success');
  assert.equal(iac.decision, 'N/A');
  assert.equal(iac.resourceOperations, false);
  assert.equal(iac.stubUnchangedSha256, red.stub.sha256);
  assert.ok(Date.parse(source.capturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(iac.decidedAtUtc));
});

test('portable HTML uses only exact local external assets and restrictive CSP', () => {
  const html = read('index.html').toString();
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-|https?:|data:|blob:/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(match => match[1]), ['model.js', 'app.js']);
  assert.deepEqual([...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(match => match[1]), ['styles.css']);
  assert.equal([...html.matchAll(/<script\b/g)].length, 2);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<style\b|<iframe\b|<base\b|<form[^>]*action=/i);
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
  assert.ok(html.includes(json('manifest.json').banner));
  assert.ok(html.includes('known-good health') || html.includes('Known-good health'));
});

test('lesson actions have no resource, shell, process, file, network or unsafe HTML execution primitives', () => {
  for (const file of ['model.js', 'app.js']) {
    const code = read(file).toString();
    assert.doesNotMatch(code, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval|Function|require)\s*\(|\b(?:process|fs|child_process)\s*\.|innerHTML|outerHTML|insertAdjacentHTML|sendBeacon|serviceWorker|localStorage|sessionStorage|document\.cookie/);
  }
  const app = read('app.js').toString();
  assert.equal([...app.matchAll(/event\.preventDefault\(\)/g)].length, 2);
  assert.ok(app.includes('textContent'));
  const manifest = json('manifest.json');
  for (const route of Object.values(manifest.syntheticInputs.initialObservedRoutingFixtures)) {
    if (route !== null) assert.equal(route.stablePercent + route.candidatePercent, 100);
  }
  assert.ok(manifest.limits.some(limit => limit.includes('DATA ONLY')));
});

test('keyboard reset, focused errors and deliberate-only browser evidence capture have explicit contracts', () => {
  const html = read('index.html').toString();
  const app = read('app.js').toString();
  const browser = read('tests\\browser.test.cjs').toString();
  assert.ok(html.includes('for="failure-trace"'));
  assert.ok(html.includes('for="operator-action"'));
  assert.ok(html.includes('role="alert" aria-live="assertive" tabindex="-1"'));
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.ok(app.includes('traceForm.reset()') && app.includes('actionForm.reset()'));
  assert.ok(app.includes('error.focus()') && app.includes('trace.focus()'));
  assert.ok(browser.includes("process.env.CAPTURE_BROWSER_EVIDENCE === '1'"));
  assert.ok(browser.includes('openIsolatedLesson'));
  assert.ok(browser.includes('finally') && browser.includes('await session.close()'));
  assert.doesNotMatch(browser, /openIsolatedLoopback|chromium\.launch|bypassCSP:\s*true|--no-sandbox/);
});

test('owned attributes qualify canonical LF Git-source integrity and raw CRLF preservation without writing objects', () => {
  assert.equal(read('.gitattributes').toString().replace(/\r\n/g, '\n'), '* text=auto eol=lf\nevidence/raw/** -text -diff\n');
  const invocation = read('evidence\\raw\\red-invocation.txt');
  assert.ok(invocation.includes(Buffer.from('\r\n')));
  assert.notEqual(sha(invocation), sha(canonical(invocation)));
  for (const relative of [
    '.gitattributes', 'model.js', 'app.js', 'index.html', 'styles.css', 'manifest.json', 'rollback-failure.feature',
    'README.md', 'tests\\model.test.cjs', 'tests\\bundle.test.cjs', 'tests\\browser.test.cjs',
    'evidence\\raw\\red-invocation.txt', 'evidence\\raw\\model.red.js.txt', 'evidence\\raw\\red.stdout.tap.txt'
  ]) {
    const file = path.join(root, relative);
    const raw = relative.startsWith('evidence\\raw\\');
    const bytes = raw ? read(relative) : canonical(read(relative));
    const actual = git(['hash-object', '--path', gitTreePath(file), file]).toString().trim();
    assert.equal(actual, gitBlobHash(bytes), relative);
  }
});

test('preserved evidence and canonical Git-source integrity cover the final owned deliverable read-only', () => {
  const index = json('evidence\\content-index.json');
  const manifest = json('manifest.json');
  const focused = json('evidence\\focused-green.json');
  const browser = json('evidence\\browser-acceptance.json');
  const preflight = json('evidence\\tooling-preflight.json');
  assert.equal(index.schemaVersion, 1);
  assert.equal(focused.passed, true);
  assert.equal(focused.leafAssertionsPassed, 25);
  assert.ok(focused.syntax.every(check => check.exitCode === 0));
  for (const key of ['stdout', 'stderr']) {
    assert.equal(sha(read(path.join('evidence', focused[key].path))), focused[key].sha256);
  }
  assert.ok(Date.parse(focused.finishedAtUtc) <= Date.parse(browser.startedAtUtc));
  assert.equal(browser.passed, true);
  assert.equal(browser.cleanup.awaitedFinallyClose, true);
  assert.equal(browser.cleanup.pageClosed, true);
  assert.equal(browser.cleanup.browserDisconnected, true);
  assert.equal(browser.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(browser.browserVersion, preflight.edge.version);
  assert.equal(preflight.edge.signatureStatus, 'Valid');
  assert.match(preflight.edge.signer, /Microsoft Corporation/);
  assert.equal(browser.helperSha256, preflight.helper.sha256);
  for (const [file, expected] of Object.entries(browser.sourceCanonicalSha256)) {
    assert.equal(sha(canonical(read(file))), expected, `Browser evidence used different source: ${file}`);
  }
  for (const key of ['rawDom', 'rawObservations']) {
    assert.equal(sha(read(path.join('evidence', browser[key].path))), browser[key].sha256);
  }
  assert.deepEqual(json(path.join('evidence', browser.rawObservations.path)), browser.observations);
  assert.equal(browser.pageErrors.length, 0);
  assert.equal(browser.requests.filter(url => /^https?:/i.test(url)).length, 0);
  assert.equal(browser.retainedHistory.length, 20);
  assert.deepEqual(browser.retainedTotals, { started: 4, success: 2, failure: 1, unknown: 1, rollbackFailures: 4, reconciliationFailures: 1, blindRejections: 1 });
  assert.ok(browser.checks.length >= 12);
  assert.equal(browser.observations.length, browser.checks.length);
  assert.ok(browser.checks.every(check => check.passed === true));
  assert.ok(browser.cspViolations.includes('connect-src'));
  assert.ok(browser.cspViolations.includes('script-src-elem'));
  assert.ok(browser.cspViolations.includes('script-src-attr'));
  assert.ok(browser.cspViolations.includes('form-action'));
  assert.equal(new Set(index.files.map(file => file.path)).size, index.files.length);
  for (const file of index.files) {
    assert.ok(!path.isAbsolute(file.path));
    const resolved = path.resolve(root, file.path);
    assert.ok(resolved.startsWith(root + path.sep));
    const bytes = file.kind === 'raw-bytes' ? fs.readFileSync(resolved) : canonical(fs.readFileSync(resolved));
    assert.equal(sha(bytes), file.sha256, file.path);
    assert.equal(bytes.length, file.byteLength, file.path);
    const gitExpected = gitBlobHash(bytes);
    assert.equal(git(['hash-object', '--path', gitTreePath(resolved), resolved]).toString().trim(), gitExpected, file.path);
    const staged = git(['ls-files', '--stage', '--', gitTreePath(resolved)]).toString().trim();
    if (staged) {
      const oid = staged.split(/\s+/)[1];
      assert.equal(oid, gitExpected, `Published Git source differs: ${file.path}`);
      assert.equal(sha(git(['cat-file', 'blob', oid])), file.sha256, `Published bytes differ: ${file.path}`);
    }
  }
  for (const reference of Object.values(manifest.evidence)) assert.ok(fs.existsSync(path.join(root, reference)));
  function list(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? list(file) : [path.relative(root, file)];
    });
  }
  assert.deepEqual(index.files.map(file => file.path).sort(),
    list(root).filter(file => file !== 'evidence\\content-index.json').sort());
});
