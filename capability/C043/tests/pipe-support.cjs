'use strict';

// Test tooling, not production code: raw-socket helpers for the pipelining matrix (rev-C043 F1). A request pipelined
// behind a refusal must never run: these helpers write several requests in ONE TCP write, parse the answers by their
// framing and compare the state and the revision (both journals) before and after.
const net = require('node:net');
const { committed, doc, step } = require('./support.cjs');

const hostOf = (port) => `127.0.0.1:${port}`;
const get = (port, target, extra = '') => `GET ${target} HTTP/1.1\r\nHost: ${hostOf(port)}\r\n${extra}\r\n`;
const send = (port, method, target, payload, extra = '') => `${method} ${target} HTTP/1.1\r\nHost: ${hostOf(port)}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(payload)}\r\n${extra}\r\n${payload}`;

// A valid preset of three steps (15 units): the mutation that must NOT apply behind a refusal.
const presetBody = (n) => JSON.stringify(doc({
  idempotencyKey: `pipe-run-${String(n).padStart(4, '0')}`,
  steps: [1, 2, 3].map((index) => step(index, { idempotencyKey: `pipe-s${n}-step-${index}` })),
}));
const mutation = (port, n = 1) => send(port, 'POST', '/v1/presets', presetBody(n));

// Splits what the server sent into whole answers by Content-Length (the service always sets it).
function parseAnswers(text) {
  const answers = [];
  let rest = text;
  for (;;) {
    const split = rest.indexOf('\r\n\r\n');
    if (split < 0) break;
    const head = rest.slice(0, split).split('\r\n');
    const status = Number(/^HTTP\/1\.1 (\d{3}) /.exec(head[0])?.[1] ?? 0);
    const length = Number(/^content-length: (\d+)$/im.exec(head.join('\n'))?.[1] ?? 0);
    if (status === 100) { rest = rest.slice(split + 4); continue; }
    if (rest.length < split + 4 + length) break;
    answers.push({ status, close: /^connection: close$/im.test(head.join('\n')), body: rest.slice(split + 4, split + 4 + length) });
    rest = rest.slice(split + 4 + length);
  }
  return answers;
}

// Writes `parts` over ONE connection (together in one write, or each after the previous answer began when `paced`) and
// collects the answers until the server closes the connection, `answers` complete answers arrived, or the hang detector
// (60 s, never a measurement: a test decides on the answers and the close, not on how long they took).
function exchange(port, parts, { paced = false, answers = 0, hardMs = 60000 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const chunks = [];
    let closedByServer = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      const list = parseAnswers(Buffer.concat(chunks).toString('latin1'));
      resolve({ answers: list, statuses: list.map((item) => item.status), closed: closedByServer });
    };
    const timer = setTimeout(finish, hardMs);
    socket.on('error', () => {});
    socket.on('close', () => { closedByServer = true; finish(); });
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      if (answers > 0 && parseAnswers(Buffer.concat(chunks).toString('latin1')).length >= answers) finish();
    });
    socket.on('connect', () => {
      if (!paced) return socket.write(parts.join(''));
      socket.write(parts[0]);
      return socket.once('data', () => { for (const part of parts.slice(1)) socket.write(part); });
    });
  });
}

const turns = async (count = 60) => { for (let turn = 0; turn < count; turn += 1) await new Promise((resolve) => setImmediate(resolve)); };

// State AND revision of an in-process service: the ledger, the number of records of both journals and their exact text.
const sample = (service) => ({
  committed: committed(service.real), stepRecords: service.real.snapshot().journalRecords, runs: service.runner.health().runs,
  stepJournal: service.stepIo.read(), runJournal: service.runIo.read(),
});

async function quiet(service) {
  for (let round = 0; round < 40 && service.runner.health().live > 0; round += 1) await turns(5);
  await turns();
}

module.exports = { exchange, get, hostOf, mutation, parseAnswers, presetBody, quiet, sample, send, turns };
