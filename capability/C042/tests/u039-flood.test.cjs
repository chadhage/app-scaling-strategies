'use strict';

// U039: a refusal flood from ANOTHER process against the service in a small-heap child, with the accepted bytes as a NAIVE
// control under the same load. Only structure is asserted, never a latency: every refused connection is closed by the
// server (a keep-alive server answers the follow-up request on it), the server holds no connection afterwards, the bytes it
// read stay bounded and its CPU time stays within a ratio of the control's. The control must fail the first check.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const lib = require('./u039-lib.cjs');

const COUNT = 25;
const MB = 1024 * 1024;

function attack(port) {
  const env = lib.childEnv();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'u039-attacker.cjs'), String(port), String(COUNT), String(Math.max(lib.CLOSE_MS * 3, 3000))], { env, windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); } });
  });
}

async function flood(child) {
  const instance = await child.start();
  const before = await child.cpu();
  const report = await attack(instance.port);
  const after = await child.cpu();
  const until = Date.now() + Math.max(lib.CLOSE_MS * 3, 30000);
  let connections = await instance.connections();
  while (connections !== 0 && Date.now() < until) { await lib.sleep(25); connections = await instance.connections(); }
  const sockets = await child.socketStats();
  const probe = await lib.exchange(instance.port, [{ data: lib.req('GET', '/scope.json', { host: `127.0.0.1:${instance.port}` }) }], { answers: 1 });
  return {
    report, connections, answeredAfter: probe.responses[0]?.status, maxBytesRead: Math.max(0, ...sockets.map((item) => item.bytesRead)),
    cpuMicros: after.user + after.system - before.user - before.system,
  };
}

test('a refusal flood from another process: every refused connection is closed by the server, the keep-alive control is not', { timeout: 900000 }, async () => {
  const served = await lib.startChild({ heapMb: 48 });
  const control = await lib.startChild({ heapMb: 48, subject: 'v1' });
  try {
    const naive = await flood(control);
    const real = await flood(served);
    console.log(`# U039 flood: control closed ${naive.report.closed}/${COUNT} (follow-up answered on ${naive.report.followUpAnswered}), subject closed ${real.report.closed}/${COUNT} (follow-up answered on ${real.report.followUpAnswered}); cpu ms control ${Math.round(naive.cpuMicros / 1000)} subject ${Math.round(real.cpuMicros / 1000)}; max bytes read ${real.maxBytesRead}`);
    assert.equal(naive.report.followUpAnswered > 0, true, 'the control (accepted bytes) keeps refused connections open, so this test can tell');
    assert.equal(real.report.refused, real.report.expectedRefused, 'every attacker socket that sent a bodiless or read-body refusal got its answer');
    assert.equal(real.report.followUpAnswered, 0, 'no follow-up request on a refused connection was answered');
    assert.equal(real.report.closed, COUNT, 'every refused connection was closed by the server');
    assert.equal(real.report.timedOut, 0);
    assert.equal(real.connections, 0, 'the server holds no connection afterwards');
    assert.equal(real.answeredAfter, 200, 'the service still answers');
    assert.equal(real.maxBytesRead < 32 * MB, true, `a refused connection was read for ${real.maxBytesRead} bytes`);
    assert.equal(real.cpuMicros <= naive.cpuMicros * 4 + 250000, true, `server CPU ${real.cpuMicros} us against ${naive.cpuMicros} us for the control`);
  } finally {
    await Promise.all([served.stop(), control.stop()]);
  }
});
