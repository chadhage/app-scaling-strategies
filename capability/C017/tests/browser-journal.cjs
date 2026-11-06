'use strict';

// F13 in REAL isolated headless Edge (a HEAVY run: hold a heavy slot): the forged journal panes the reviewer showed in the DOM are served as GET
// /api/state views by a lying loopback proxy of the real server (the helper blocks POST, so a forged answer has to be a served GET) and the REAL
// page must refuse every one of them, list nothing, disable every command, and recover when the honest view returns. One session.
//   node capability\C017\tests\browser-journal.cjs                       (assertions only)
//   $env:CAPTURE_BROWSER_EVIDENCE='browser-journal-03'; node capability\C017\tests\browser-journal.cjs   (also writes evidence\browser-journal-03.json once)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { openIsolatedLoopback } = require('../../../testing/browser/isolated.cjs');
const s = require('./support.cjs');
const h = require('./http.cjs');

function edgeIdentity(version) {
  const signed = JSON.parse(execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'signed-edge.ps1')], { encoding: 'utf8', timeout: 150000, windowsHide: true }));
  assert.equal(signed.authenticodeStatus, 'Valid', 'Edge must be validly signed');
  assert.match(signed.signer, /Microsoft Corporation/);
  assert.equal(version.split('.')[0], '156', 'the qualified Edge major version is 156');
  return { version, sha256: createHash('sha256').update(fs.readFileSync(signed.executable)).digest('hex'), signature: signed.authenticodeStatus, signer: signed.signer, fileVersion: signed.fileVersion };
}

const read = (page) => page.evaluate(() => {
  const text = (id) => document.getElementById(id).textContent;
  const items = (id) => [...document.getElementById(id).children].map((child) => child.textContent);
  return { status: text('status'), outcome: text('outcome'), steps: items('steps'), facts: items('facts'), journal: items('journal'), ids: [...document.querySelectorAll('[id]')].map((node) => node.id),
    disabled: Object.fromEntries(['start', 'cancel', 'reconcile', 'compensate'].map((id) => [id, document.getElementById(id).disabled])) };
});

async function lyingServer(realOrigin, box) {
  const server = http.createServer(async (request, response) => {
    try {
      const upstream = await fetch(`${realOrigin}${request.url}`, { cache: 'no-store' });
      let body = Buffer.from(await upstream.arrayBuffer());
      if (request.url === '/api/state') { box.served += 1; if (box.lie) body = Buffer.from(JSON.stringify(box.lie(JSON.parse(body.toString('utf8'))))); }
      response.writeHead(upstream.status, { ...Object.fromEntries(upstream.headers), 'content-length': body.length, connection: 'close' });
      response.end(body);
    } catch { response.destroy(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

const forgeries = [
  ['the decision line says COMPENSATED and carries no actionId', (v) => { v.journal[v.journal.length - 1] = { type: 'cancel-decided', at: 't', outcome: 'COMPENSATED' }; }],
  ['compensation-effect lines for steps 1 and 2, which STAND', (v) => { v.journal.push({ type: 'compensation-effect', at: 't', actionId: v.action.actionId, step: 1, units: -5, standingUnits: 5 }, { type: 'compensation-effect', at: 't', actionId: v.action.actionId, step: 2, units: -5, standingUnits: 0 }); }],
  ['action-completed on a cancelled action', (v) => { v.journal.push({ type: 'action-completed', at: 't', actionId: v.action.actionId, standingUnits: 10 }); }],
  ['a COMPENSATED decision with a foreign actionId', (v) => { v.journal.push({ ...v.journal[v.journal.length - 1], actionId: 'act-9-aaaaaaaa', outcome: 'COMPENSATED' }); }],
  ['a view with action: null whose journal decides a COMPENSATED cancel', (v) => { v.action = null; v.epoch = 0; v.journal = [{ type: 'cancel-decided', at: 't', actionId: 'act-1-00000002', key: 'k-1234567', outcome: 'COMPENSATED', effectsStanding: [], stepsNotRun: [], undone: [1, 2], compensation: 'COMPLETE' }]; }],
  ['a step-effect for step 3, which never ran', (v) => { v.journal.push({ type: 'step-effect', at: 't', actionId: v.action.actionId, step: 3, units: 5, standingUnits: 15 }); }],
];

async function main() {
  const cleanups = [];
  const env = await h.serve({ after: (fn) => cleanups.push(fn) }, {});
  env.ctx.g.hold('before', 3);
  const started = await h.post(env.origin, '/api/start', s.startCmd('browser-journal-01'));
  await env.ctx.g.reached('before', 3);
  const decided = await h.post(env.origin, '/api/cancel', s.cancelCmd('browser-journal-02', started.json.action.actionId));
  assert.equal(decided.json.outcome, 'CANCELLED_PARTIAL');
  const box = { lie: null, served: 0 };
  const lying = await lyingServer(env.origin, box);
  let session = null;
  const records = [];
  try {
    session = await openIsolatedLoopback('capability\\C017\\index.html', lying);
    const { page } = session;
    const show = async (label, lie) => {
      box.lie = lie;
      const before = box.served;
      await page.click('#refresh');
      const end = Date.now() + 90000;
      while (box.served === before && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 25));
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return { label, dom: await read(page) };
    };
    const honest = await show('honest', null);
    assert.equal(honest.dom.status, 'Stopped partway: some effects STAND. See the outcome below.');
    assert.equal(honest.dom.journal.length, 8, 'every re-derived line of the honest view is shown');
    for (const [label, forge] of forgeries) {
      const forged = await show(label, (view) => { forge(view); return view; });
      assert.match(forged.dom.outcome, /^Answer rejected: the server's state view contradicts its own facts/, `${label}: refused`);
      assert.deepEqual([forged.dom.steps.length, forged.dom.facts.length, forged.dom.journal.length], [0, 0, 0], `${label}: nothing is listed`);
      assert.ok(Object.values(forged.dom.disabled).every(Boolean), `${label}: nothing may be commanded`);
      assert.doesNotMatch([forged.dom.status, forged.dom.outcome, ...forged.dom.journal].join('\n').replace(/^Answer rejected:.*$/gm, ''), /COMPENSATED|compensation-effect|action-completed/, `${label}: a forged claim is shown`);
      assert.equal(new Set(forged.dom.ids).size, forged.dom.ids.length, `${label}: repeated ids`);
      const back = await show(`${label}: honest again`, null);
      assert.equal(back.dom.status, 'Stopped partway: some effects STAND. See the outcome below.', `${label}: the page recovers`);
      assert.equal(back.dom.journal.length, 8);
      assert.doesNotMatch(back.dom.outcome, /^Answer rejected/, `${label}: the sentence of the refusal is gone`);
      records.push({ label, verdict: 'refused', outcome: forged.dom.outcome.slice(0, 90), recovered: true });
    }
    const identity = edgeIdentity(session.browserVersion);
    console.log(JSON.stringify({ edge: identity, forgeries: records.length }));
    return { schema: 'C017-browser-journal/1', helper: 'testing/browser/isolated.cjs openIsolatedLoopback', limits: 'same-origin GET/HEAD only: forged views are served GETs through a lying loopback proxy of the real server', edge: identity, sessions: 1, records };
  } finally {
    if (session) await session.close();
    await new Promise((resolve) => lying.close(resolve));
    for (const fn of cleanups.reverse()) await fn();
  }
}

main().then((observation) => {
  const capture = process.env.CAPTURE_BROWSER_EVIDENCE;
  if (capture) {
    if (!/^browser-journal-\d{2}$/.test(capture)) throw new Error('CAPTURE_BROWSER_EVIDENCE must name a NEW file: browser-journal-NN');
    fs.writeFileSync(path.join(__dirname, '..', 'evidence', `${capture}.json`), `${JSON.stringify(observation, null, 2)}\n`, { flag: 'wx' });
  }
  console.log('browser-journal: every forged journal pane was refused in real Edge and the page recovered');
  process.exit(0);
}).catch((error) => { console.error(error); process.exit(1); });
