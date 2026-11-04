'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { hash, relative, listFiles, inventory, definitions, selectBytes, git } = require('./record.cjs');

const root = path.resolve(__dirname, '..', '..');
function bytes(file) {
  const resolved = path.resolve(__dirname, file);
  assert.ok(resolved.startsWith(`${__dirname}${path.sep}`), 'Evidence paths stay in the owned lesson.');
  return fs.readFileSync(resolved);
}
const json = (file) => JSON.parse(bytes(file));

test('exact original S149 and D-S149 acceptance, A/B inventory and SOURCE contract remain frozen', () => {
  const source = json('evidence\\source.json');
  assert.equal(source.cardId, 'A-S149');
  assert.equal(source.kanoUnit, 'A-S149');
  assert.equal(source.kano, 'S');
  assert.equal(source.priority, 'P1');
  assert.equal(source.packet, 'SC-S149');
  assert.equal(source.technicalEntryGate, 'SOURCE');
  assert.deepEqual(source.stateRead, {
    mutex: 'Local\\AppScalingStrategies_KanbanState_v1', readHandlesClosedBeforeRelease: true,
  });
  assert.equal(source.claimedCard.owner, 'worker-A-S149');
  assert.equal(source.claimedCard.state, 'In Progress');
  assert.equal(source.claimedCard.authorization, 'local-synthetic-only');
  const rows = source.sources.flatMap((entry) => entry.working.slices);
  assert.equal(rows.find((row) => row.label === 'S149').text[0],
    '| S149 | **Five-nines evidence:** Measure affected transitions with uncertainty and correlated-failure analysis, not a small successful sample. |');
  assert.equal(rows.find((row) => row.label === 'D-S149').text[0],
    '| D-S149 | P1 | Add cost-approved batch evidence collection, confidence calculations, and independent-event/cluster analysis views. | Distinguish journeys from requests and correlated swaps; zero-failure independent-trial illustration uses 299,572 trials at one-sided 95%; insufficient evidence never yields a five-nines-certified badge. | D-S141, D-S145, D-S148 |');
  assert.equal(rows.find((row) => row.label === 'A-S149').text[0],
    '| A-S149 | D-S149 | S | Compare request/user/event counts; verify the 299,572-trial illustration and insufficient-evidence warning. | SOURCE |');
  assert.equal(rows.find((row) => row.label === 'B-S149').text[0],
    '| B-S149 | D-S149 | S | Collect one approved native evidence batch; verify correlation-aware counting and an honest confidence gap, not certification. | CORE, DATA, HOST |');
  assert.equal(rows.find((row) => row.label === 'SOURCE').text[0],
    '| SOURCE | The supplied backlog and portable lesson contract; available now. |');
  const acceptance = rows.find((row) => row.label === 'acceptance and evidence').text.join('\n');
  assert.match(acceptance, /failed or uncertain started transitions must not be removed from the denominator/);
  assert.match(acceptance, /n >= ceil\(ln\(0\.05\) \/ ln\(1 - 0\.00001\)\) = 299572/);
  assert.match(acceptance, /users in one swap can share a correlated failure/);
  assert.match(rows.find((row) => row.label === 'portable contract').text.join('\n'), /standalone, browser-openable lesson/);
  assert.equal(hash(bytes(source.inventory.file)), source.inventory.sha256);
  const original = json(source.inventory.file);
  assert.deepEqual(original.cards.filter((card) => ['A-S149', 'B-S149'].includes(card.id)), source.inventory.cards);
  for (const card of source.inventory.cards) {
    assert.equal(card.kano, 'S');
    assert.equal(card.priority, 'P1');
    assert.equal(card.packet, 'SC-S149');
    assert.deepEqual(card.parents, ['D-S149']);
  }
});

test('original working CRLF and canonical Git bytes are independently preserved without text conversion', () => {
  const source = json('evidence\\source.json');
  for (const entry of source.sources) {
    const definition = definitions.find((item) => item.name === entry.name);
    for (const variant of ['working', 'canonical']) {
      const proof = entry[variant];
      const raw = zlib.gunzipSync(bytes(proof.fullPath));
      assert.equal(hash(raw), proof.sha256);
      assert.equal(raw.length, proof.byteLength);
      assert.equal((raw.toString('utf8').match(/\r\n/g) || []).length, proof.crlfCount);
      const selected = selectBytes(raw, definition.selectors);
      assert.equal(hash(selected.bytes), proof.selectionSha256);
      assert.deepEqual(bytes(proof.selectedPath), selected.bytes);
      assert.deepEqual(selected.slices.map(({ bytes: ignored, ...slice }) => slice), proof.slices);
      const logical = `learning/S149/${proof.selectedPath.split('\\').join('/')}`;
      const attributes = git('check-attr', 'text', 'diff', '--', logical).toString('utf8');
      assert.match(attributes, /text: unset/);
      assert.match(attributes, /diff: unset/);
      const selectedBytes = bytes(proof.selectedPath);
      const result = spawnSync('git', ['hash-object', '--stdin', `--path=${logical}`], {
        cwd: root, input: selectedBytes, encoding: null, windowsHide: true,
      });
      assert.equal(result.status, 0, String(result.stderr));
      const independentlyRaw = crypto.createHash('sha1')
        .update(Buffer.from(`blob ${selectedBytes.length}\0`)).update(selectedBytes).digest('hex');
      assert.equal(result.stdout.toString('utf8').trim(), independentlyRaw);
      if (variant === 'canonical') assert.deepEqual(raw, git('show', `${source.canonicalCommit}:${entry.canonicalPath}`));
    }
    assert.ok(entry.working.crlfCount > 0, 'Raw working CRLF must be original, not reconstructed.');
    assert.equal(entry.canonical.crlfCount, 0);
    assert.notEqual(entry.working.sha256, entry.canonical.sha256);
    assert.deepEqual(entry.working.slices.map((slice) => slice.text), entry.canonical.slices.map((slice) => slice.text));
  }
});

test('BDD and loadable genuine assertion RED precede explicit resource-free IaC N/A', () => {
  const workflow = json('evidence\\workflow.json');
  assert.deepEqual(workflow.events.slice(0, 3).map((event) => event.phase),
    ['source-read-and-frozen', 'bdd-loadable-assertion-red', 'iac-not-applicable']);
  assert.equal(workflow.extraCredits, 0);
  const red = json(workflow.events[1].proof);
  assert.equal(red.expected, 'assertion-red');
  assert.equal(red.exitCode, 1);
  assert.equal(red.signal, null);
  const raw = bytes(red.stdout.file).toString('utf8');
  assert.match(raw, /ok 1 - loadable contract/);
  assert.match(raw, /ERR_ASSERTION/);
  assert.match(raw, /\+ 'UNKNOWN_EVIDENCE'/);
  assert.match(raw, /- 'CONDITIONAL_BOUND_MET'/);
  assert.doesNotMatch(raw, /MODULE_NOT_FOUND|SyntaxError|ReferenceError/);
  const context = { module: { exports: {} } };
  vm.runInNewContext(bytes(red.inputs.find((input) => input.file === 'model.js').snapshot).toString('utf8'), context);
  assert.equal(context.module.exports.createSession().schema, 'S149/session/v1');
  assert.equal(context.module.exports.evaluate().confidence.status, 'UNKNOWN_EVIDENCE');
  assert.match(bytes(red.inputs.find((input) => input.file === 'statistics.feature').snapshot).toString('utf8'),
    /n = 299571 exceeds 0.00001/);
  assert.match(workflow.events[2].reason, /Resource-free deterministic standalone fictional lesson/);
  for (let index = 1; index < workflow.events.length; index++) {
    assert.ok(workflow.events[index].recordedAtUtc >= workflow.events[index - 1].recordedAtUtc);
  }
});

test('historical raw inputs and both streams retain every captured failure and successful run', () => {
  const records = listFiles().filter((file) => relative(file).startsWith('evidence\\raw\\') && path.basename(file) === 'run.json');
  assert.ok(records.length >= 1);
  let assertionRed = false;
  for (const file of records) {
    const proof = JSON.parse(fs.readFileSync(file));
    assert.equal(proof.cardId, 'A-S149');
    for (const input of proof.inputs) {
      assert.equal(hash(bytes(input.snapshot)), input.sha256);
      assert.equal(bytes(input.snapshot).length, input.byteLength);
      assert.ok(input.snapshot.endsWith('.snapshot'), 'Old failing tests are outside autodiscovery.');
    }
    for (const stream of ['stdout', 'stderr']) {
      assert.equal(hash(bytes(proof[stream].file)), proof[stream].sha256);
      assert.equal(bytes(proof[stream].file).length, proof[stream].byteLength);
    }
    if (proof.expected === 'assertion-red' && proof.exitCode === 1) assertionRed = true;
  }
  assert.equal(assertionRed, true);
});

test('actual failed file-resource-timing assumption and successful DOM proofs both remain raw with awaited cleanup', () => {
  const files = listFiles().filter((file) => relative(file).startsWith('evidence\\raw\\browser-dom-')
    && path.basename(file) === 'report.json');
  assert.ok(files.length >= 2);
  let originalFailure = false;
  let actualPass = false;
  for (const file of files) {
    const proof = JSON.parse(fs.readFileSync(file));
    assert.equal(proof.cardId, 'A-S149');
    assert.equal(proof.captureMode, true);
    assert.equal(proof.cleanup.awaitedFinallyClose, true);
    assert.equal(proof.certification, false);
    for (const input of proof.inputs) {
      assert.match(input.sha256, /^[a-f0-9]{64}$/);
    }
    for (const snapshot of proof.domSnapshots) {
      assert.equal(hash(bytes(snapshot.file)), snapshot.sha256);
      assert.equal(bytes(snapshot.file).length, snapshot.byteLength);
    }
    if (!proof.passed && proof.failure?.message.includes('initialResourceURLs.length')) {
      originalFailure = true;
      assert.deepEqual(proof.initialResourceURLs, []);
      assert.ok(proof.domSnapshots.some((snapshot) => snapshot.label === 'raw-failed-browser-state'));
    }
    if (proof.passed) {
      actualPass = true;
      assert.deepEqual(proof.observedLoadedFiles, ['index.html', 'lesson.js', 'model.js', 'style.css']);
      assert.equal(proof.observations.length, 22);
      assert.equal(proof.cspProbe.scriptExecuted, false);
      assert.equal(proof.cspProbe.styleApplied, false);
      assert.equal(proof.cspProbe.connection, 'TypeError');
      assert.equal(proof.pageErrors.length, 0);
    }
  }
  assert.equal(originalFailure, true, 'Original real driver failure must not be overwritten or relabelled.');
  assert.equal(actualPass, true);
});

test('original canonical-byte publication failure and semantic-free LF repair preserve original raw evidence', () => {
  const repair = json('evidence\\publication-repair.json');
  assert.equal(repair.kanoUnit, 'A-S149');
  assert.equal(repair.extraCredits, 0);
  assert.equal(repair.originalRemoteVerified, true);
  assert.equal(hash(bytes(repair.receipt.file)), repair.receipt.sha256);
  const receipt = json(repair.receipt.file);
  assert.equal(receipt.commit, repair.originalCommit);
  assert.equal(receipt.tag, repair.originalTag);
  const failed = json(repair.assertionProof);
  assert.equal(failed.expected, 'publication-byte-failure');
  assert.equal(failed.exitCode, 1);
  assert.match(bytes(failed.stdout.file).toString('utf8'), /ERR_ASSERTION/);
  const workflow = json('evidence\\workflow.json');
  const normalized = workflow.events.find((event) => event.phase === 'owned-text-normalized-for-canonical-publication');
  assert.ok(normalized);
  const proof = json(normalized.proof);
  assert.equal(proof.extraCredits, 0);
  for (const record of proof.records) {
    const before = bytes(record.beforePath);
    const after = bytes(record.afterPath);
    assert.equal(hash(before), record.beforeSha256);
    assert.equal(hash(after), record.afterSha256);
    assert.deepEqual(Buffer.from(before.toString('utf8').replace(/\r\n/g, '\n')), after);
    assert.equal(record.semanticChange, false);
  }
});

test('standalone runtime, restrictive CSP, native reset and honest bounded native remainder', () => {
  const html = bytes('index.html').toString('utf8');
  const runtime = ['model.js', 'lesson.js'].map((file) => bytes(file).toString('utf8')).join('\n');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]), ['model.js', 'lesson.js']);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "script-src-attr 'none'", "style-src 'self'", "style-src-attr 'none'",
    "connect-src 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "form-action 'none'", "base-uri 'none'",
  ]) assert.ok(html.includes(directive), directive);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|\son[a-z]+\s*=|\sstyle\s*=/i);
  assert.doesNotMatch(html, /(?:name|id)="reset"/);
  assert.match(runtime, /form\.reset\(\)/);
  assert.doesNotMatch(runtime, /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|serviceWorker|localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(runtime, /\b(?:setInterval|setTimeout)\s*\(/);
  const manifest = json('manifest.json');
  assert.equal(manifest.objective, 'Compare request/user/event counts; verify the 299,572-trial illustration and insufficient-evidence warning.');
  assert.equal(manifest.mode, 'bounded standalone fixed fictional teaching DATA ONLY');
  assert.equal(manifest.bounds.attempts, 12);
  assert.equal(manifest.bounds.journalEvents, 36);
  assert.equal(manifest.bounds.individualOriginalRecordsPerProfileMaximum, 4);
  const remainder = json('remainder.json');
  assert.equal(remainder.kanoUnit, 'B-S149');
  assert.equal(remainder.kano, 'S');
  assert.equal(remainder.packet, 'SC-S149');
  assert.equal(remainder.readiness, false);
  assert.equal(remainder.technicalEntryGate, 'CORE, DATA, HOST');
  assert.equal(remainder.nativeEvidence, 'unverified');
  assert.equal(remainder.parentCompletion, 'not claimed');
  assert.equal(remainder.extraCreditsForRefinement, 0);
  assert.match(remainder.originalParentDependency, /D-S141, D-S145, D-S148.*H011 \+ P005 \+ HOST/);
  assert.match(remainder.blocker, /No live collection/);
});

test('only exact capture opt-in can write; nonexact values fail before producing any owned evidence', () => {
  const before = inventory();
  for (const setting of ['true', '01', '0', '', undefined]) {
    const env = { ...process.env };
    if (setting === undefined) delete env.CAPTURE_BROWSER_EVIDENCE;
    else env.CAPTURE_BROWSER_EVIDENCE = setting;
    const result = spawnSync(process.execPath, [path.join(__dirname, 'record.cjs'), 'source'], {
      cwd: root, encoding: 'utf8', windowsHide: true, env,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Capture requires exact CAPTURE_BROWSER_EVIDENCE=1/);
  }
  const captureVerify = spawnSync(process.execPath, [path.join(__dirname, 'record.cjs'), 'verify'], {
    cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: '1' },
  });
  assert.equal(captureVerify.status, 1);
  assert.match(captureVerify.stderr, /Unset deliberate capture for read-only verify/);
  assert.deepEqual(inventory(), before);
});

test('current JavaScript and focused test files pass native syntax checks without extra tooling', () => {
  for (const file of ['model.js', 'lesson.js', 'record.cjs', 'model.test.cjs', 'integrity.test.cjs', 'canonical.test.cjs', 'browser.test.cjs']) {
    const result = spawnSync(process.execPath, ['--check', path.join(__dirname, file)], {
      cwd: root, encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test('retained browser proof and publication-ready seal bind all owned bytes when present', () => {
  const browserFile = path.join(__dirname, 'evidence', 'browser.json');
  if (fs.existsSync(browserFile)) {
    const proof = json('evidence\\browser.json');
    assert.equal(proof.passed, true);
    assert.equal(proof.cleanup.awaitedFinallyClose, true);
    assert.equal(hash(bytes(proof.rawProof)), proof.rawProofSha256);
    const raw = json(proof.rawProof);
    assert.equal(raw.passed, true);
    assert.deepEqual(raw.observations, proof.observations);
    for (const input of proof.inputs) assert.equal(hash(bytes(input.file)), input.sha256);
    for (const snapshot of proof.domSnapshots) {
      assert.equal(hash(bytes(snapshot.file)), snapshot.sha256);
      assert.equal(bytes(snapshot.file).length, snapshot.byteLength);
    }
  }
  if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
    const seal = json('evidence\\seal.json');
    assert.equal(seal.kanoUnit, 'A-S149');
    assert.equal(seal.extraCredits, 0);
    assert.deepEqual(inventory().filter((entry) => entry.file !== 'evidence\\seal.json'), seal.files);
    assert.ok(fs.existsSync(browserFile), 'Normal verification requires retained proof; it never creates proof.');
  }
});
