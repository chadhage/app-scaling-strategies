'use strict';

// Real isolated headless Edge observation through the shared helper (a HEAVY run: hold a heavy slot). The helper forwards only
// same-origin GET/HEAD and blocks writes, so the browser can never deliver a POST: its own Cancel click is observed to be
// reported as "not delivered, UNKNOWN", and every real outcome is produced by a Node client POST and OBSERVED by the page through GET.
//   node capability\C017\tests\browser.cjs                      (assertions only, evidence untouched)
//   $env:CAPTURE_BROWSER_EVIDENCE='1'; node capability\C017\tests\browser.cjs   (also writes evidence\browser-observation.json once)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { openIsolatedLoopback } = require('../../../testing/browser/isolated.cjs');
const s = require('./support.cjs');
const h = require('./http.cjs');

const entry = 'capability\\C017\\index.html';

function edgeIdentity(version) {
  const out = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'signed-edge.ps1')], { encoding: 'utf8', timeout: 20000, windowsHide: true });
  const signed = JSON.parse(out);
  assert.equal(signed.authenticodeStatus, 'Valid', 'Edge must be validly signed');
  assert.match(signed.signer, /Microsoft Corporation/);
  assert.equal(version.split('.')[0], '156', 'the qualified Edge major version is 156');
  const sha256 = createHash('sha256').update(fs.readFileSync(signed.executable)).digest('hex');
  return { version, sha256, signature: signed.authenticodeStatus, signer: signed.signer, thumbprint: signed.thumbprint, fileVersion: signed.fileVersion };
}

const read = (page) => page.evaluate(() => {
  const text = (id) => document.getElementById(id).textContent;
  const items = (id) => [...document.getElementById(id).children].map((child) => child.textContent);
  const disabled = (id) => document.getElementById(id).disabled;
  return {
    status: text('status'), lease: text('lease'), steps: items('steps'), units: text('units'), outcome: text('outcome'), facts: items('facts'), journal: items('journal'),
    disabled: { start: disabled('start'), cancel: disabled('cancel'), reconcile: disabled('reconcile'), compensate: disabled('compensate') },
    ids: [...document.querySelectorAll('[id]')].map((node) => node.id), active: document.activeElement && document.activeElement.id,
  };
});

// L-0118: after every observation the rendered ids are unique and the journal numbering is the exact delivered sequence.
function assertRenderedConsistent(snapshot, label, totalSteps = 4) {
  assert.equal(new Set(snapshot.ids).size, snapshot.ids.length, `${label}: repeated element ids`);
  const numbered = snapshot.journal.map((line) => /^#(\d+) /.exec(line)).filter(Boolean).map((m) => Number(m[1]));
  assert.equal(new Set(snapshot.journal).size, snapshot.journal.length, `${label}: a journal line is repeated`);
  numbered.forEach((n, i) => assert.equal(n, numbered[0] + i, `${label}: journal numbering is not contiguous`));
  if (snapshot.steps.length) assert.deepEqual(snapshot.steps.map((x) => x.slice(0, 7)), Array.from({ length: totalSteps }, (_, i) => `Step ${i + 1}:`), `${label}: steps`);
}

async function tabTo(page, id) {
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement.id) === id) return;
  }
  throw new Error(`Tab never reached #${id}`);
}
const waitText = (page, id, prefix) => page.waitForFunction(({ id: target, prefix: start }) => document.getElementById(target).textContent.startsWith(start), { id, prefix }, { timeout: 10000 });

async function scenario(name, options, act, record, versionBox) {
  const cleanups = [];
  const env = await h.serve({ after: (fn) => cleanups.push(fn) }, options.boot || {});
  let session = null;
  try {
    await options.setup(env);
    session = await openIsolatedLoopback(entry, env.server);
    versionBox.version = session.browserVersion;
    await act(session.page, env);
    const final = await read(session.page);
    assertRenderedConsistent(final, name);
    record.push({ scenario: name, final });
  } finally {
    if (session) await session.close();
    for (const fn of cleanups.reverse()) await fn();
  }
}

async function main() {
  const records = [];
  const versionBox = { version: null };
  const startBody = (key) => ({ schemaVersion: 1, kind: 'start', key, ...s.attribution, expectedEpoch: 0 });
  const holdThree = async (env) => { env.ctx.g.hold('before', 3); env.start = (await h.post(env.origin, '/api/start', startBody('browser-start-01'))).json; await env.ctx.g.reached('before', 3); };

  await scenario('in-flight: the browser-sent cancel is blocked and reported as not delivered, then a server-decided partial outcome is observed', { setup: holdThree }, async (page, env) => {
    await waitText(page, 'status', 'In flight: 2 of 4');
    const before = await read(page);
    assertRenderedConsistent(before, 'in-flight');
    assert.deepEqual(before.disabled, { start: true, cancel: false, reconcile: true, compensate: false });
    await tabTo(page, 'cancel');
    await page.keyboard.press('Enter');
    await waitText(page, 'outcome', 'The request was not delivered');
    const blocked = await read(page);
    assert.match(blocked.outcome, /UNKNOWN: nothing is claimed as cancelled, stopped, started or undone\./);
    assert.doesNotMatch(blocked.outcome, /\b(was|were|been|is) (cancelled|undone|rolled back|reversed)\b/i);
    assert.equal(s.decisions(env.ctx).length, 0);
    assert.equal(env.ctx.engine.view().journal.some((e) => e.type === 'cancel-requested'), false, 'the blocked POST never reached the server');
    records.push({ scenario: 'in-flight (blocked cancel)', final: blocked });
    const answer = await h.post(env.origin, '/api/cancel', s.cancelCmd('browser-cancel-01', env.start.action.actionId));
    assert.equal(answer.json.outcome, 'CANCELLED_PARTIAL');
    await waitText(page, 'outcome', 'Stopped after step 2 of 4');
    const decided = await read(page);
    assert.equal(decided.outcome, answer.json.statement, 'the page shows exactly the statement the journal proves');
    assert.equal(decided.status, 'Stopped partway: some effects STAND. See the outcome below.');
    assert.deepEqual(decided.steps.map((x) => x.split(' (')[0]), ['Step 1: STANDS', 'Step 2: STANDS', 'Step 3: NOT RUN', 'Step 4: NOT RUN']);
    assert.ok(decided.journal.at(-1).endsWith('cancel-decided CANCELLED_PARTIAL'));
  }, records, versionBox);

  await scenario('compensated: the words reversed by compensating steps appear only with journaled compensating effects', { setup: holdThree }, async (page, env) => {
    await waitText(page, 'status', 'In flight: 2 of 4');
    const answer = await h.post(env.origin, '/api/cancel', s.cancelCmd('browser-cancel-02', env.start.action.actionId, 1, true));
    assert.equal(answer.json.outcome, 'COMPENSATED');
    await waitText(page, 'outcome', 'Stopped after step 2 and reversed');
    const state = await read(page);
    assert.equal(state.outcome, answer.json.statement);
    assert.deepEqual(state.steps.map((x) => x.split(' (')[0].replace(/ by its own.*/, '')), ['Step 1: REVERSED', 'Step 2: REVERSED', 'Step 3: NOT RUN', 'Step 4: NOT RUN']);
    assert.ok(state.journal.filter((l) => l.includes('compensation-effect')).length === 2);
  }, records, versionBox);

  await scenario('too late: a completed action stays completed and the cancel is shown as not effective', {
    setup: async (env) => { env.start = (await h.post(env.origin, '/api/start', startBody('browser-start-01'))).json; await s.wait(env.ctx, (st) => st.action.status === 'COMPLETED'); },
  }, async (page, env) => {
    await waitText(page, 'status', 'Completed: all 4 steps');
    const answer = await h.post(env.origin, '/api/cancel', s.cancelCmd('browser-cancel-03', env.start.action.actionId));
    assert.equal(answer.status, 409);
    await tabTo(page, 'refresh');
    await page.keyboard.press('Space');
    await waitText(page, 'outcome', 'Too late');
    const state = await read(page);
    assert.equal(state.outcome, answer.json.statement);
    assert.match(state.outcome, /The cancel was NOT effective\.$/);
    assert.equal(state.status, 'Completed: all 4 steps took effect.');
  }, records, versionBox);

  const first = s.boot();
  first.g.hold('in', 3);
  const actionId = await s.startAction(first);
  await first.g.reached('in', 3);
  await first.engine.close();
  await scenario('interrupted: after a restart the action is neither cancelled nor completed until reconciled', { setup: async () => {}, boot: { dir: first.dir } }, async (page, env) => {
    await waitText(page, 'status', 'Interrupted by a server restart');
    const state = await read(page);
    assert.deepEqual(state.disabled, { start: true, cancel: true, reconcile: false, compensate: true });
    assert.ok(state.steps[2].startsWith('Step 3: UNKNOWN'));
    assert.doesNotMatch(state.status, /^(Completed|Stopped)/);
    const answer = await h.post(env.origin, '/api/reconcile', s.reconcileCmd('browser-reconcile-1', actionId));
    assert.equal(answer.json.determination, 'INTERRUPTED_UNKNOWN');
    await tabTo(page, 'refresh');
    await page.keyboard.press('Enter');
    await waitText(page, 'status', 'Interrupted and reconciled');
  }, records, versionBox);
  await first.cleanup();

  const garbage = s.scratch('b');
  fs.writeFileSync(path.join(garbage.dir, 'journal.jsonl'), 'tampered\n');
  await scenario('unreadable: a damaged journal is UNKNOWN and nothing can be started or cancelled', { setup: async () => {}, boot: { dir: garbage.dir } }, async (page) => {
    await waitText(page, 'status', 'The journal cannot be read');
    const state = await read(page);
    assert.deepEqual(state.disabled, { start: true, cancel: true, reconcile: true, compensate: true });
    assert.match(state.status, /UNKNOWN: nothing is claimed as cancelled, completed or undone\.$/);
  }, records, versionBox);
  garbage.remove();

  const edge = edgeIdentity(versionBox.version);
  const observation = {
    schema: 'C017-browser-observation/1', helper: 'testing/browser/isolated.cjs openIsolatedLoopback', limits: 'same-origin GET/HEAD only; every POST is blocked by the helper, so outcomes are produced by a Node client and observed by the page through GET',
    edge: { version: edge.version, fileVersion: edge.fileVersion, sha256: edge.sha256, signature: edge.signature, signer: edge.signer, thumbprint: edge.thumbprint }, scenarios: records,
  };
  records.forEach((record) => assertRenderedConsistent(record.final, record.scenario));
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    fs.writeFileSync(path.join(__dirname, '..', 'evidence', 'browser-observation.json'), `${JSON.stringify(observation, null, 2)}\n`, { flag: 'wx' });
  }
  console.log(JSON.stringify({ ok: true, edge: observation.edge, scenarios: records.map((r) => r.scenario), captured: process.env.CAPTURE_BROWSER_EVIDENCE === '1' }, null, 2));
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
