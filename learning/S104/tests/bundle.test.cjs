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
const gitPath = relative => path.join('learning', 'S104', relative).split(path.sep).join('/');

function git(args, input) {
  const result = spawnSync('git', ['--no-pager', ...args], { cwd: repo, input, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}

function rawRecord(record) {
  const bytes = read(path.join('evidence', record.path));
  assert.equal(sha(bytes), record.sha256);
  assert.equal(bytes.length, record.bytes);
  assert.ok(record.path.endsWith('.snapshot'));
  return bytes;
}

function walk(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    assert.equal(entry.isSymbolicLink(), false);
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? walk(path.join(directory, entry.name), relative) : [relative];
  });
}

test('manifest preserves exact S104 objective, SOURCE gate and one frozen S unit', () => {
  const manifest = json('manifest.json');
  for (const [key, value] of Object.entries({
    schemaVersion: 1, sourceId: 'S104', cardId: 'A-S104', parentId: 'D-S104', packet: 'SC-S104',
    kano: 'S', kanoUnit: 'A-S104', technicalEntryGate: 'SOURCE', owner: 'worker-A-S104',
    objective: 'Compare internal warm-up and external redirects/callbacks; detect misleading internal success.',
    entry: 'index.html', mode: 'synthetic', banner: 'Training rehearsal - synthetic data - not a live Azure result'
  })) assert.equal(manifest[key], value);
  for (const key of ['preconditions', 'actions', 'expectedAssertions', 'limits']) assert.ok(manifest[key].length > 0);
  assert.equal(manifest.syntheticInputs.maxRuns, 12);
  assert.equal(manifest.syntheticInputs.journeyBudgetMs, 250);
  assert.equal(manifest.acceptance.acceptedAtUtc, null);
  assert.match(manifest.acceptance.nativeSibling, /B-S104.*D-S104.*P006/);
});

test('exact source acceptance, raw CRLF excerpts and independently pinned Git blobs are preserved', () => {
  const source = json('evidence\\source-contract.json');
  const manifest = json('manifest.json');
  assert.equal(source.readBeforeBehaviorDesign, true);
  assert.equal(source.inventory.deliver, manifest.objective);
  assert.equal(source.inventory.packet, 'SC-S104');
  assert.equal(source.claim.owner, 'worker-A-S104');
  assert.equal(source.claim.authorization, 'local-synthetic-only');
  assert.equal(source.sourceAcceptance, 'External production-path failures are detected despite internal health success; approved redirects do not loop or lose state.');
  assert.match(source.exactBacklogRow, /\| P006 \|$/);
  assert.match(source.exactReadmeRow, /Prevent warm-up success from hiding production redirect or callback failures/);
  assert.equal(source.exactACardRow, `| A-S104 | D-S104 | S | ${manifest.objective} | SOURCE |`);
  const fragments = [];
  for (const file of source.sourceFiles) {
    const blob = git(['cat-file', 'blob', file.gitBlobOid]);
    assert.equal(sha(blob), file.gitBlobSha256);
    for (const fragment of file.fragments) {
      const raw = rawRecord(fragment.raw);
      const qualified = rawRecord(fragment.git);
      assert.ok(blob.includes(qualified));
      assert.ok(canonical(raw).equals(canonical(qualified)));
      assert.equal(sha(canonical(qualified)), fragment.canonicalSha256);
      const crlf = (raw.toString().match(/\r\n/g) || []).length;
      assert.equal(crlf, fragment.rawLineEndings.crlf);
      assert.ok(crlf > 0, 'the captured Windows source has actual CRLF bytes');
      assert.notEqual(fragment.raw.sha256, fragment.canonicalSha256, 'raw CRLF is not mislabeled canonical LF');
      fragments.push(canonical(qualified).toString());
    }
  }
  const all = fragments.join('\n');
  for (const exactRow of [source.exactReadmeRow, source.exactBacklogRow, source.exactACardRow]) assert.ok(all.includes(exactRow));
  assert.match(all, /## Atomic card contract/);
  assert.match(all, /### Portable A-card lesson contract/);
  assert.match(all, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(all, /every other A\/B card belongs to SC-Snnn/);
  assert.match(all, /\| B-S104 \|.*CORE, DATA, HOST, C092/);
});

test('loadable wrong-behavior assertion RED precedes explicit IaC N/A; no missing tool masquerades as RED', () => {
  const red = json('evidence\\red.json');
  const source = json('evidence\\source-contract.json');
  const iac = json('evidence\\iac-decision.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.snapshotsAutoDiscovered, false);
  const output = rawRecord(red.stdout).toString();
  rawRecord(red.stderr);
  rawRecord(red.bdd);
  const stub = rawRecord(red.stub).toString();
  rawRecord(red.assertions);
  assert.match(output, /ERR_ASSERTION/);
  assert.match(output, /expected: 'failure'/);
  assert.match(output, /actual: 'success'/);
  assert.match(output, /# fail 4/);
  assert.match(output, /# pass 1/);
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|SyntaxError/);
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(stub, sandbox);
  const wrong = sandbox.module.exports;
  assert.equal(typeof wrong.createState, 'function');
  assert.equal(typeof wrong.run, 'function');
  const record = wrong.run(wrong.createState(), { scenarioId: 'callback-state-lost', actionId: 'compare' }).history[0];
  assert.equal(record.assessment.status, 'success');
  assert.equal(iac.decision, 'N/A');
  assert.equal(iac.resourceOperations, false);
  assert.equal(iac.stubUnchangedSha256, red.stub.sha256);
  assert.ok(Date.parse(source.capturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(iac.decidedAtUtc));
});

test('portable HTML, keyboard/error/reset UX and CSP have exact local contracts', () => {
  const html = read('index.html').toString();
  const app = read('app.js').toString();
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"
  ]) assert.ok(csp.includes(directive));
  assert.doesNotMatch(csp, /unsafe-|https?:|data:|blob:/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(match => match[1]), ['model.js', 'app.js']);
  assert.deepEqual([...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(match => match[1]), ['styles.css']);
  assert.equal([...html.matchAll(/<script\b/g)].length, 2);
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<style\b|<iframe\b|<base\b|<form[^>]*action=/i);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.ok(html.includes(json('manifest.json').banner));
  assert.ok(html.includes('for="fixture"') && html.includes('for="operator-action"'));
  assert.ok(html.includes('role="alert" aria-live="assertive" tabindex="-1"'));
  assert.ok(app.includes('form.reset()') && app.includes('fixture.focus()') && app.includes('error.focus()'));
  assert.ok(app.includes('event.preventDefault()'));
  const model = require('..\\model.js');
  assert.deepEqual([...html.matchAll(/<option value="([^"]+)">/g)].map(match => match[1]), [...model.SCENARIOS, ...model.ACTIONS].map(item => item.id));
});

test('lesson code contains no network, management, identity, storage or unsafe HTML execution primitives', () => {
  for (const file of ['model.js', 'app.js']) {
    const code = read(file).toString();
    assert.doesNotMatch(code, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval|Function|require)\s*\(|\b(?:process|fs|child_process)\s*\.|innerHTML|outerHTML|insertAdjacentHTML|sendBeacon|serviceWorker|localStorage|sessionStorage|document\.cookie|window\.open|location\s*[.=]/);
  }
  assert.match(read('app.js').toString(), /textContent/);
  assert.ok(json('manifest.json').limits.some(value => value.includes('DATA ONLY')));
});

test('browser tooling is the published byte-qualified helper and existing signed offline pair only', () => {
  const tooling = json('evidence\\tooling-preflight.json');
  const browserTest = read('tests\\browser.test.cjs').toString();
  assert.equal(tooling.playwright, '1.56.1');
  assert.match(tooling.node, /^v22\./);
  assert.match(tooling.browser.version, /^156\./);
  assert.equal(tooling.browser.signatureStatus, 'Valid');
  assert.match(tooling.browser.signer, /Microsoft Corporation/);
  assert.equal(tooling.approvedLifecycle, false);
  assert.equal(tooling.helper.rawSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(tooling.helper.commit, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
  const helperBlob = git(['cat-file', 'blob', tooling.helper.gitBlobOid]);
  assert.equal(sha(helperBlob), tooling.helper.canonicalGitSha256);
  const helperBytes = fs.readFileSync(path.join(repo, tooling.helper.path));
  assert.ok(canonical(helperBytes).equals(helperBlob));
  rawRecord(tooling.stdout);
  rawRecord(tooling.stderr);
  assert.ok(browserTest.includes("process.env.CAPTURE_BROWSER_EVIDENCE === '1'"));
  assert.ok(browserTest.includes('openIsolatedLesson'));
  assert.ok(browserTest.includes('finally') && browserTest.includes('await session.close()'));
  assert.doesNotMatch(browserTest, /openIsolatedLoopback|chromium\.launch|bypassCSP\s*:\s*true|--no-sandbox|browser_navigate/);
});

test('all owned files use canonical Git-source integrity or explicitly preserved raw-byte qualification', () => {
  const index = json('evidence\\content-index.json');
  assert.equal(index.cardId, 'A-S104');
  const files = walk(root).filter(file => file !== 'evidence\\content-index.json').sort();
  assert.deepEqual(index.files.map(file => file.path), files);
  const attributes = read('.gitattributes').toString();
  assert.match(attributes, /\* text=auto eol=lf/);
  assert.match(attributes, /evidence\/raw\/\*\* -text -diff/);
  for (const file of index.files) {
    const bytes = read(file.path);
    const raw = file.path.startsWith('evidence\\raw\\');
    const qualified = raw ? bytes : canonical(bytes);
    assert.equal(file.qualification, raw ? 'raw-preserved' : 'canonical-git-source');
    assert.equal(file.bytes, qualified.length, file.path);
    assert.equal(file.sha256, sha(qualified), file.path);
    const expectedBlob = crypto.createHash('sha1').update(Buffer.from(`blob ${qualified.length}\0`)).update(qualified).digest('hex');
    assert.equal(git(['hash-object', `--path=${gitPath(file.path)}`, '--stdin'], bytes).toString().trim(), expectedBlob, file.path);
  }
});

test('captured browser evidence binds actual DOM/failure/unknown/keyboard/error/reset/CSP and close observations', {
  skip: !fs.existsSync(path.join(root, 'evidence', 'browser-acceptance.json')) && 'browser capture has not occurred yet'
}, () => {
  const browser = json('evidence\\browser-acceptance.json');
  assert.equal(browser.passed, true);
  assert.equal(browser.mode, 'synthetic');
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(browser.close.awaited, true);
  assert.equal(browser.close.pageClosed, true);
  assert.equal(browser.externalRequests.length, 0);
  assert.equal(browser.pageErrors.length, 0);
  assert.equal(browser.csp.inlineExecuted, false);
  assert.equal(browser.csp.evalExecuted, false);
  assert.equal(browser.csp.evalDenied, true);
  assert.ok(browser.csp.violations.length >= 2);
  for (const label of ['internal-only', 'keyboard-callback-failure', 'approved', 'host-mismatch', 'redirect-loop', 'authentication-fails', 'routing-mismatch', 'external-unobserved', 'callback-unobserved', 'input-error', 'keyboard-reset', 'session-limit', 'reset-keeps-limit', 'csp']) {
    const checkpoint = browser.checkpoints.find(value => value.label === label);
    assert.ok(checkpoint, label);
    rawRecord(checkpoint.dom);
  }
  assert.equal(browser.rejectedMisleadingSuccess.code, 'ERR_ASSERTION');
  for (const file of browser.inputHashes) assert.equal(sha(canonical(read(file.path))), file.canonicalSha256, file.path);
  rawRecord(browser.rawObservations);
  rawRecord(browser.assertions);
});
