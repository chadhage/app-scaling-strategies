'use strict';

// Evidence-phase tooling of the third fix (NOT a test, NOT run by the suite, not pinned by any capture; it writes nothing and asserts nothing, it
// reports). The F24 attack of tests\pending-flood-process.test.cjs with MORE attacker connections and with the smallest possible request, to measure
// what the 64 KB-per-read bound means for a 48 MB-heap child: the real CLI with a pending first request (--hold-in-step=3), the attacker in ANOTHER
// process (tests\fixtures\pending-attacker.cjs), one JSON line on stdout. The probe lives under evidence\ so that adding it does not change any
// input pin; it has to be run from the repository root.
// usage: node capability\C017\evidence\by-hand-04\probe64.cjs <sockets> <state|min> [final|first-fix|second-fix]
// The optional subject runs the SAME attack against the retained bytes of the first fix (evidence\red\prefix-8e7046e9) or of the second fix
// (evidence\red\prefix-8832dac5) through the overlay of tests\fixtures\overlay-preload.cjs, in the child only.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const T = path.join(__dirname, '..', '..', 'tests');
const s = require(path.join(T, 'support.cjs'));
const h = require(path.join(T, 'http.cjs'));
const { startChild, pollState, readMem } = require(path.join(T, 'child.cjs'));

const SOCKETS = Number(process.argv[2] || 64);
const KIND = process.argv[3] || 'state';
const SUBJECT = process.argv[4] || 'final';
const retained = 'capability/C017/evidence/red';
const OVERLAYS = {
  final: null,
  'first-fix': {
    'capability/C017/server.cjs': `${retained}/prefix-8e7046e9/server.snapshot.cjs`,
    'capability/C017/contract.js': `${retained}/prefix-8e7046e9/contract.snapshot.js`,
    'capability/C017/page.js': `${retained}/prefix-8e7046e9/page.snapshot.js`,
    'capability/C017/reconcile.cjs': `${retained}/prefix-8e7046e9/reconcile.snapshot.cjs`,
  },
  'second-fix': { 'capability/C017/server.cjs': `${retained}/prefix-8832dac5/server.snapshot.cjs` },
};
const overlay = OVERLAYS[SUBJECT];
if (overlay === undefined) { console.error(`unknown subject ${SUBJECT}`); process.exit(2); }
const fixtures = path.join(T, 'fixtures');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.endsWith('}')).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } }) : []);

function cancelRequest(port, key, actionId) {
  const body = JSON.stringify(s.cancelCmd(key, actionId, 1, false));
  return `POST /api/cancel HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

function attack(spec) {
  const child = spawn(process.execPath, [path.join(fixtures, 'pending-attacker.cjs'), JSON.stringify(spec)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let out = '';
  child.stdout.on('data', (part) => { out += part; });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve(JSON.parse(out.trim())) : reject(new Error(`the attacker process exited with ${code}`))));
  });
  return { done, child };
}

async function main() {
  const afters = [];
  const ctl = new AbortController();
  const stopAll = setTimeout(() => ctl.abort(), 300000);
  const t = { after: (fn) => afters.push(fn), signal: ctl.signal };
  const made = s.scratch('probe64');
  afters.push(() => made.remove());
  const netLog = path.join(made.dir, 'net.jsonl');
  const memFile = path.join(made.dir, 'mem.json');
  const report = { subject: SUBJECT, sockets: SOCKETS, kind: KIND };
  let attacker = null;
  try {
    const kid = startChild(t, {
      nodeFlags: ['--max-old-space-size=48', '--expose-gc', '--require', path.join(fixtures, 'net-log-preload.cjs')],
      env: { C017_NET_LOG: netLog, C017_MEM_FILE: memFile, ...(overlay ? { C017_OVERLAY: JSON.stringify(overlay), NODE_OPTIONS: '--require=./capability/C017/tests/fixtures/overlay-preload.cjs' } : {}) },
      args: [`--dir=${made.dir}`, '--step-delay-ms=0', '--hold-in-step=3'],
    });
    const died = kid.exited.then((exit) => ({ died: true, ...exit }));
    const origin = await kid.origin();
    const { port } = new URL(origin);
    const started = await h.post(origin, '/api/start', s.startCmd('probe-start-0001'));
    const actionId = started.json.action.actionId;
    await pollState(origin, (state) => state.journal.some((entry) => entry.type === 'step-intent' && entry.step === 3), 'step 3 never began', { signal: t.signal });
    const before = await readMem(memFile, { signal: t.signal });
    const request = KIND === 'min' ? 'GET / HTTP/1.1\r\n\r\n' : `GET /api/state HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`;
    const spec = {
      port: Number(port), sockets: SOCKETS, maxRequests: 50000, requestsPerBlock: Math.floor(65000 / request.length), request,
      firsts: Array.from({ length: SOCKETS }, (_, index) => cancelRequest(port, `probe-cancel-${index}`, actionId)),
    };
    attacker = attack(spec);
    const first = await Promise.race([attacker.done.then((value) => ({ attacked: value })), died]);
    report.firstResult = first.died ? { died: true, code: first.code, signal: first.signal, fatal: (kid.errors().match(/FATAL ERROR[^\r\n]*/) || [kid.errors().slice(0, 200)])[0] } : { gaveUp: first.attacked.gaveUp.filter(Boolean).length, pushedMax: Math.max(...first.attacked.pushed) };
    if (!first.died) {
      const ports = first.attacked.ports.filter((value) => value !== null);
      let seen = [];
      for (let waited = 0; waited < 600; waited += 1) {
        seen = lines(netLog).filter((line) => ports.includes(line.remotePort));
        if (seen.length >= ports.length || kid.child.exitCode !== null) break;
        await sleep(100);
      }
      report.logged = seen.length;
      report.bytesRead = seen.length ? { min: Math.min(...seen.map((l) => l.bytesRead)), max: Math.max(...seen.map((l) => l.bytesRead)) } : null;
      report.childAlive = kid.child.exitCode === null && kid.child.signalCode === null;
      if (report.childAlive) {
        const answered = await Promise.race([h.get(origin, '/api/state').then((r) => r.status), died.then(() => 'died')]);
        report.legitGet = answered;
        let after = await readMem(memFile, { signal: t.signal });
        for (let i = 0; i < 100 && after.heapUsed >= before.heapUsed + 24 * 1024 * 1024; i += 1) { await sleep(100); after = await readMem(memFile, { signal: t.signal }); }
        report.heap = { before: before.heapUsed, after: after.heapUsed };
        const stopped = await kid.stop();
        report.stopCode = stopped.code;
      } else {
        report.exit = { code: kid.child.exitCode, signal: kid.child.signalCode, fatal: (kid.errors().match(/FATAL ERROR[^\r\n]*/) || [''])[0] };
      }
    }
  } catch (error) {
    report.error = String(error && error.message).slice(0, 300);
  } finally {
    clearTimeout(stopAll);
    if (attacker && attacker.child.exitCode === null) attacker.child.kill();
    for (const fn of afters.reverse()) { try { await fn(); } catch { /* best effort */ } }
  }
  console.log(JSON.stringify(report));
}

main().then(() => process.exit(0));
