'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { hash, listFiles, relative, selected, sourceDefinitions } = require('./record.cjs');
const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(__dirname, file));
const json = (file) => JSON.parse(read(file).toString('utf8'));
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: null, windowsHide: true });
  assert.equal(result.status, 0, `Read-only git: ${result.stderr}`);
  return result.stdout;
};

test('exact scoped seal covers every persisted lesson file without regenerating evidence', () => {
  const seal = json('evidence\\integrity.json');
  assert.equal(seal.cardId, 'A-S140');
  assert.deepEqual(seal.excluded, ['evidence\\integrity.json']);
  const files = listFiles().map(relative).filter((file) => file !== 'evidence\\integrity.json').sort();
  assert.deepEqual(files, seal.files.map((entry) => entry.file).sort());
  for (const entry of seal.files) {
    const bytes = read(entry.file);
    assert.equal(hash(bytes), entry.sha256, entry.file);
    assert.equal(bytes.length, entry.byteLength, entry.file);
  }
  const objectFormat = git('rev-parse', '--show-object-format').toString('utf8').trim();
  for (const entry of seal.files) {
    const bytes = read(entry.file);
    const rawObject = crypto.createHash(objectFormat).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    // --path is canonical Git attribute metadata, not a Windows file operand.
    const attributePath = `learning/S140/${entry.file.split('\\').join('/')}`;
    const filtered = spawnSync('git', ['hash-object', '--stdin', `--path=${attributePath}`], {
      cwd: root, input: bytes, encoding: null, windowsHide: true,
    });
    assert.equal(filtered.status, 0, String(filtered.stderr));
    assert.equal(filtered.stdout.toString('utf8').trim(), rawObject,
      `${entry.file}: sealed raw bytes must equal canonical Git bytes; verification never repairs them.`);
  }
});

test('exact source acceptance, portable card and packet retain separate raw CRLF and canonical Git proof', () => {
  const contract = json('evidence\\source.json');
  assert.equal(contract.cardId, 'A-S140');
  assert.equal(contract.parentId, 'D-S140');
  assert.equal(contract.packet, 'SC-S140');
  for (const [index, source] of contract.sources.entries()) {
    const definition = sourceDefinitions[index];
    for (const variant of ['working', 'canonical']) {
      const info = source[variant];
      const full = zlib.gunzipSync(read(info.fullPath));
      assert.equal(hash(full), info.sha256);
      assert.equal(full.length, info.byteLength);
      assert.equal((full.toString('utf8').match(/\r\n/g) || []).length, info.crlfCount);
      const selection = selected(full, definition.definitions);
      assert.equal(hash(selection.buffer), info.selectionSha256);
      assert.deepEqual(read(info.selectionPath), selection.buffer);
      assert.deepEqual(selection.slices.map(({ raw, ...slice }) => slice), info.selected);
      if (variant === 'canonical') {
        assert.deepEqual(git('show', `${contract.canonicalCommit}:${source.canonicalPath}`), full);
      }
    }
    const current = selected(fs.readFileSync(path.join(root, source.file)), definition.definitions);
    assert.deepEqual(current.slices.map((slice) => slice.text), source.working.selected.map((slice) => slice.text), 'Selected source contract must not drift.');
  }
  assert.equal(contract.sources[0].working.selected[0].text[0],
    '| S140 | **Asynchronous report/export:** Preserve job status and artifact access when processing and download reach different deployments. |');
  assert.equal(contract.sources[1].working.selected[0].text[0],
    '| D-S140 | P1 | Add asynchronous export submission, processing cutover, polling, and download. | Job state, final artifact bytes, authorization, and download access survive independent tier transitions. | D-S039, D-S048, D-S044 |');
  assert.match(contract.sources[2].working.selected[0].text[0], /^\| A-S140 \| D-S140 \| S \| .* \| SOURCE \|$/);
  assert.match(contract.sources[2].working.selected[3].text[0], /every other A\/B card belongs to SC-Snnn/);
});

test('retained RED is a loadable stub with fifteen genuine assertion failures, not an environmental failure', () => {
  const red = json('evidence\\raw\\red\\run.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.expected, 'assertion-red');
  assert.equal(red.error, null);
  assert.equal(hash(read(red.stdout.file)), red.stdout.sha256);
  assert.equal(hash(read(red.stderr.file)), red.stderr.sha256);
  const tap = read(red.stdout.file).toString('utf8');
  assert.match(tap, /ok 1 - loadable contract/);
  assert.match(tap, /not ok 2 - complete owner journey/);
  assert.match(tap, /ERR_ASSERTION/);
  assert.match(tap, /# pass 1\n# fail 15/);
  assert.doesNotMatch(tap, /MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError/);
  for (const input of red.inputs) assert.equal(hash(read(input.snapshot)), input.sha256);
  const context = { module: { exports: {} } };
  vm.runInNewContext(read('evidence\\raw\\red\\model.js.snapshot').toString('utf8'), context);
  const stub = context.module.exports;
  assert.equal(stub.createSession().stage, 'ready');
  assert.equal(stub.act(stub.createSession(), { type: 'submit' }).stage, 'ready');
  assert.notEqual(hash(read('model.js')), red.inputs.find((input) => input.file === 'model.js').sha256);
  const testSource = red.inputs.find((input) => input.file === 'model.test.cjs');
  const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
  assert.equal(hash(canonical(read('model.test.cjs'))), hash(canonical(read(testSource.snapshot))),
    'The actual RED test source is unchanged apart from explicit CRLF-to-canonical-LF representation.');
});

test('BDD RED IaC N/A implementation and syntax order is explicit and all raw evidence attributes forbid conversion', () => {
  const workflow = json('evidence\\workflow.json');
  const phases = workflow.events.map((entry) => entry.phase);
  const required = ['source-read-and-preserved', 'bdd-loadable-stub-assertion-red', 'iac-not-applicable',
    'implemented-refactored-focused-green', 'focused-syntax-green'];
  let previous = -1;
  for (const phase of required) {
    const index = phases.indexOf(phase);
    assert.ok(index > previous, phase);
    previous = index;
  }
  const iac = workflow.events.find((entry) => entry.phase === 'iac-not-applicable');
  assert.match(iac.reason, /Resource-free.*fixed-fiction.*No cloud/);
  const green = workflow.events.findLast((entry) => entry.phase === 'implemented-refactored-focused-green');
  const run = json(green.proof);
  assert.equal(run.exitCode, 0);
  assert.match(read(run.stdout.file).toString('utf8'), /# pass 16\n# fail 0/);
  for (const input of run.inputs) {
    assert.equal(hash(read(input.snapshot)), input.sha256);
    assert.equal(hash(read(input.file)), input.sha256, 'Final GREEN inputs must match the delivered implementation.');
  }
  const syntax = json('evidence\\syntax.json');
  const scripts = fs.readdirSync(__dirname).filter((file) => /\.(?:cjs|js)$/.test(file)).sort();
  assert.deepEqual(syntax.checks.map((entry) => entry.file), scripts);
  for (const check of syntax.checks) {
    assert.equal(check.exitCode, 0);
    assert.equal(hash(read(check.file)), check.sha256);
  }
  const rawFiles = listFiles().map(relative).filter((file) => file.startsWith('evidence\\raw\\'));
  const attributes = git('check-attr', '-z', 'text', 'diff', '--', ...rawFiles.map((file) => `learning\\S140\\${file}`)).toString('utf8').split('\0');
  for (let index = 0; index < attributes.length - 1; index += 3) {
    assert.ok(['text', 'diff'].includes(attributes[index + 1]));
    assert.equal(attributes[index + 2], 'unset', attributes[index]);
  }
  assert.equal(attributes.length - 1, rawFiles.length * 6);
});

test('portable page has strict CSP and no runtime networking, persistence, dynamic HTML or form-reset shadow', () => {
  const html = read('index.html').toString('utf8');
  const scripts = `${read('model.js')}\n${read('lesson.js')}`;
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(html, /Fixed fictional teaching DATA ONLY/);
  for (const directive of ["default-src 'none'", "script-src 'self'", "script-src-attr 'none'", "connect-src 'none'",
    "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(html.includes(directive));
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>|(?:\s)on\w+\s*=|(?:id|name)=["']reset["']/i);
  assert.doesNotMatch(scripts, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|localStorage|sessionStorage|indexedDB)\b|sendBeacon|serviceWorker|innerHTML|form\.reset\s*\(/);
  assert.doesNotMatch(html, /(?:src|href)=["'](?:https?:|\/\/|data:|javascript:)/i);
  const helperSha = hash(fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs')));
  assert.equal(helperSha, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.match(read('browser.test.cjs').toString('utf8'), /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
});

test('one original frozen unit and honest blocked native remainder keep parent-owned integration untouched', () => {
  const manifest = json('manifest.json');
  const remainder = json('remainder.json');
  assert.equal(manifest.cardId, 'A-S140');
  assert.equal(manifest.kanoUnit, 'A-S140');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.packet, 'SC-S140');
  assert.equal(manifest.entryPoint, 'index.html');
  assert.equal(manifest.limits.networkOperations, false);
  assert.equal(manifest.limits.nativeAzureResult, 'unverified');
  assert.deepEqual(remainder.nativeRemainder.technicalGates, ['CORE', 'DATA', 'HOST', 'OBJECT', 'C025']);
  assert.deepEqual(remainder.nativeRemainder.sourceDependencies, ['D-S039', 'D-S048', 'D-S044']);
  assert.equal(remainder.nativeRemainder.readiness, false);
  assert.equal(remainder.nativeRemainder.proposedState, 'To Do');
  assert.equal(remainder.credits.originalUnits, 1);
  assert.equal(remainder.credits.extraTestRepairProofRefinementCredits, 0);
  assert.equal(remainder.credits.workerAwardedDoneCredits, 0);
  assert.equal(manifest.originalParentAcceptance, remainder.originalAcceptance);
});
