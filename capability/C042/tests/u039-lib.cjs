'use strict';

// Test tooling, not production code (U039): a raw-socket pipelining probe. One TCP write is one `writes` entry. The
// probe records the answers the CLIENT received, whether the SERVER ended the connection, and reads the state and the
// journal of the service before and after, in this process or in a separate one. The subject is the real server.cjs,
// the archived accepted bytes (U039_SUBJECT=v1, the RED) or a mutant file (U039_SUBJECT=file:<repository path>).
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const { fork } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const SNAPSHOT = path.join(root, 'evidence', 'u039-pipelining', 'server.v1.cjs.txt');
const V1_SHA256 = '2503ad0fbd1455810068c03386061d57100e4ad97a7635923bb220ea7dbb16f2';
// The same bytes with CRLF turned into LF (a tree converted by a checkout or a tool): the pin accepts either form.
const V1_LF_SHA256 = '3949f39bb5199ea870718cfc5518d5fc922a23a9a7c3aae799d9acf0656f824d';
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lfOf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// How long a connection that must be closed by the server may stay open after the last write. A generous default so that a
// loaded machine never fails a correct server; the RED and mutant runs shorten it (they expect an open connection).
const CLOSE_MS = Number(process.env.U039_CLOSE_MS ?? 20000);
// The timers that would end an idle or slow connection anyway are set to ten minutes, so that only the RULE under test can close one.
const QUIET = Object.freeze({ requestMs: 600000, headersMs: 600000, keepAliveMs: 600000, idleMs: 600000, firstRequestMs: 600000 });

// Polls a condition (sync or async) until it holds. The bound is a liveness guard for a broken server, never the thing asserted.
async function until(check, label, ms = Math.max(CLOSE_MS, 1500)) {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`never held: ${label}`);
    await sleep(5);
  }
}

// The subject is compiled as if it lived at capability\C042\server.cjs, so its relative requires and assets resolve. Compiled bytes that are not the real
// file get a NAME of their own: two scripts with one name and different offsets would corrupt a merged V8 coverage report of the real server.cjs.
function loadSubject(which = process.env.U039_SUBJECT ?? 'real') {
  if (which === 'real') return require('../server.cjs');
  const file = which === 'v1' ? SNAPSHOT : path.resolve(repository, which.replace(/^file:/, ''));
  const bytes = fs.readFileSync(file);
  if (which === 'v1' && sha256(bytes) !== V1_SHA256 && sha256(lfOf(bytes)) !== V1_LF_SHA256) throw new Error('the archived accepted server.cjs changed');
  const filename = path.join(root, 'server.cjs');
  const compiled = path.join(root, 'tests', 'scratch', 'subject', `${which === 'v1' ? 'v1' : 'file'}-${sha256(bytes).slice(0, 12)}.cjs`);
  const run = vm.compileFunction(bytes.toString('utf8'), ['exports', 'require', 'module', '__filename', '__dirname'], { filename: compiled });
  const mod = { exports: {} };
  run.call(mod.exports, mod.exports, Module.createRequire(filename), mod, filename, root);
  return mod.exports;
}

// The environment of every child process the tooling starts. NODE_V8_COVERAGE gets an OWN, empty value: Node re-injects the caller's value into any
// child whose env object has no own key of that name (L-0140), so a child that runs other bytes (the accepted server, a mutant) would write V8 coverage
// into the caller's directory, and a killed child would leave a truncated file; deleting the key does not help. NODE_TEST_CONTEXT is removed (L-0002).
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra, NODE_V8_COVERAGE: '' };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

// Raw HTTP request bytes. body: Buffer | string | object (JSON). Content-Length is added unless framing headers are given.
function req(method, target, { host, headers = {}, body, version = '1.1' } = {}) {
  const lines = [`${method} ${target} HTTP/${version}`];
  if (host !== null) lines.push(`Host: ${host}`);
  const given = { ...headers };
  let payload = null;
  if (body !== undefined) {
    payload = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    if (!Object.keys(given).some((key) => ['content-length', 'transfer-encoding'].includes(key.toLowerCase()))) given['Content-Length'] = String(payload.length);
  }
  for (const [key, value] of Object.entries(given)) lines.push(`${key}: ${value}`);
  const head = Buffer.from(`${lines.join('\r\n')}\r\n\r\n`, 'latin1');
  return payload ? Buffer.concat([head, payload]) : head;
}

function split(buffer) {
  const at = buffer.indexOf('\r\n\r\n');
  return { head: buffer.subarray(0, at).toString('latin1').split('\r\n'), body: buffer.subarray(at + 4) };
}
const join = (head, body) => Buffer.concat([Buffer.from(`${head.join('\r\n')}\r\n\r\n`, 'latin1'), body]);
// The same request with a chunked body, with Expect: 100-continue, or in HTTP/1.0 framing (optionally asking to keep alive).
function chunked(buffer) {
  const { head, body } = split(buffer);
  const lines = head.filter((line) => !/^content-length:/i.test(line)).concat('Transfer-Encoding: chunked');
  const chunk = body.length ? Buffer.concat([Buffer.from(`${body.length.toString(16)}\r\n`), body, Buffer.from('\r\n')]) : Buffer.alloc(0);
  return join(lines, Buffer.concat([chunk, Buffer.from('0\r\n\r\n')]));
}
const expecting = (buffer) => { const { head, body } = split(buffer); return join([...head, 'Expect: 100-continue'], body); };
function asVersion(buffer, version, keepAlive = false) {
  if (version === '1.1') return buffer;
  const { head, body } = split(buffer);
  const first = head[0].replace(/ HTTP\/1\.1$/, ' HTTP/1.0');
  return join([first, ...head.slice(1), ...(keepAlive ? ['Connection: keep-alive'] : [])], body);
}

function parseResponses(buffer) {
  const out = [];
  let at = 0;
  while (at < buffer.length) {
    const end = buffer.indexOf('\r\n\r\n', at);
    if (end < 0) { out.push({ partial: buffer.length - at }); break; }
    const lines = buffer.subarray(at, end).toString('latin1').split('\r\n');
    const match = /^HTTP\/1\.[01] (\d{3}) ?(.*)$/.exec(lines[0]);
    if (!match) { out.push({ garbage: lines[0].slice(0, 80) }); break; }
    const headers = Object.fromEntries(lines.slice(1).map((line) => [line.slice(0, line.indexOf(':')).toLowerCase(), line.slice(line.indexOf(':') + 1).trim()]));
    const status = Number(match[1]);
    let stop = end + 4;
    if (status !== 100 && headers['content-length'] !== undefined) stop = Math.min(buffer.length, end + 4 + Number(headers['content-length']));
    else if (status !== 100 && /chunked/i.test(headers['transfer-encoding'] ?? '')) stop = Math.min(buffer.length, buffer.indexOf('0\r\n\r\n', end + 4) < 0 ? buffer.length : buffer.indexOf('0\r\n\r\n', end + 4) + 5);
    const text = status === 100 ? '' : buffer.subarray(end + 4, stop).toString('utf8');
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    out.push({ status, reason: match[2], connection: headers.connection ?? null, code: json?.error?.code ?? null, accepted: json?.accepted ?? null, text: text.slice(0, 120) });
    at = stop;
  }
  return out;
}

// writes: [{ data, delay }]. Resolves when the server ended the connection, or (expectClose false) once `answers` answers
// arrived, or after CLOSE_MS without any activity. The client never closes first on a refusal.
function exchange(port, writes, { answers = null, closeMs = CLOSE_MS } = {}) {
  return new Promise((resolve) => {
    const chunks = [];
    let active = Date.now();
    let closed = false;
    let writing = true;
    let error = null;
    const socket = net.connect({ port, host: '127.0.0.1', allowHalfOpen: true });
    socket.setNoDelay(true);
    socket.on('data', (chunk) => { chunks.push(chunk); active = Date.now(); });
    socket.on('end', () => { closed = true; });
    socket.on('error', (failure) => { error = failure.code ?? String(failure); closed = true; });
    socket.on('close', () => { closed = true; });
    socket.on('connect', async () => {
      for (const write of writes) {
        if (write.delay) await sleep(write.delay);
        if (socket.destroyed) break;
        socket.write(write.data);
      }
      writing = false;
      active = Date.now();
    });
    const timer = setInterval(() => {
      const parsed = parseResponses(Buffer.concat(chunks)).filter((item) => item.status !== undefined && item.status !== 100);
      const done = !writing && (closed || (answers !== null && parsed.length >= answers) || Date.now() - active > closeMs);
      if (!done) return;
      clearInterval(timer);
      const buffer = Buffer.concat(chunks);
      resolve({ responses: parseResponses(buffer), bytes: buffer.length, closedByServer: closed, socketError: error });
      socket.destroy();
    }, 15);
  });
}

// A journal that already holds `count` steps (all cancelled but the last, which is open: began, no terminal record), so that the
// next admission meets the bound of 256 steps while the open step can still be cancelled.
function prefillJournal(io, count) {
  const opened = require('../journal.cjs').openJournal(io);
  for (let index = 0; index < count; index += 1) {
    const open = index === count - 1;
    const key = open ? 'key-open-0001' : `key-${String(index).padStart(4, '0')}-fill`;
    const input = { schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: key, leaseId: 'synthetic-lease-001', units: 1 };
    opened.append({ type: 'begin', key, inputSha256: require('../input.cjs').digestInput(input), input });
    if (!open) opened.append({ type: 'cancel', key });
  }
}

// An instance is a service plus a way to read its state: the lease ledger, the journal record count (the revision) and
// the SHA-256 of the whole journal.
async function startInProcess({ executor, transcript = null, prefill = 0, bounds = QUIET } = {}) {
  const subject = loadSubject();
  const { openEngine } = require('../engine.cjs');
  const journal = require('../journal.cjs');
  const io = journal.createMemoryIo();
  if (prefill > 0) prefillJournal(io, prefill);
  const engine = await openEngine({ io, executor });
  const produce = transcript === 'fail' ? async () => { throw new Error('the transcript fails'); } : transcript;
  const server = subject.createLocalServer({ engine, transcript: produce, bounds });
  const sockets = [];
  server.on('connection', (serverSide) => sockets.push(serverSide));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    port: server.address().port, server, sockets, state: async () => ({ snapshot: engine.snapshot(), journal: sha256(io.read()) }),
    connections: () => new Promise((resolve) => server.getConnections((failure, count) => resolve(failure ? -1 : count))),
    close: () => subject.closeServer(server),
  };
}

// The same service in a SEPARATE process (u039-child.cjs); every start answers a fresh instance of that process.
async function startChild({ heapMb = 0, execArgv = [], subject = process.env.U039_SUBJECT ?? 'real' } = {}) {
  const env = childEnv({ U039_SUBJECT: subject });
  const child = fork(path.join(__dirname, 'u039-child.cjs'), [], { env, execArgv: [...(heapMb ? [`--max-old-space-size=${heapMb}`] : []), ...execArgv], silent: true });
  const errors = [];
  child.stderr.on('data', (chunk) => errors.push(chunk));
  const pending = new Map();
  let serial = 0;
  const gone = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.on('message', (message) => { pending.get(message.id)?.(message); pending.delete(message.id); });
  const ask = (type, extra = {}) => new Promise((resolve, reject) => {
    serial += 1;
    pending.set(serial, resolve);
    child.send({ id: serial, type, ...extra }, (failure) => { if (failure) reject(failure); });
    gone.then((result) => reject(new Error(`the child exited: ${JSON.stringify(result)} ${Buffer.concat(errors)}`)));
  });
  // An orphan guard only: a child server that outlives its test run is killed. It is far above any run on a loaded machine, so it never decides a test.
  const watchdog = setTimeout(() => child.kill(), 1800000);
  watchdog.unref();
  const instance = (id, port) => ({
    port, state: async () => (await ask('state', { instance: id })).state, connections: async () => (await ask('connections', { instance: id })).count,
    close: async () => { await ask('close', { instance: id }); },
  });
  return {
    pid: child.pid,
    start: async (options = {}) => { const answer = await ask('start', { options }); return instance(answer.instance, answer.port); },
    cpu: async () => (await ask('cpu')).cpu, socketStats: async () => (await ask('sockets')).sockets,
    stop: async () => { try { await ask('stop'); } catch { /* the child already left */ } clearTimeout(watchdog); child.kill(); return gone; },
    errors: () => Buffer.concat(errors).toString('utf8'),
  };
}

// Poll until two reads in a row agree (the effects of dropped or late handlers need a moment); no sleep is asserted.
async function settled(instance, { stable = 3, maxMs = 10000 } = {}) {
  let last = null;
  let same = 0;
  const deadline = Date.now() + maxMs;
  while (same < stable && Date.now() < deadline) {
    const now = JSON.stringify(await instance.state());
    same = now === last ? same + 1 : 0;
    last = now;
    if (same < stable) await sleep(15);
  }
  return JSON.parse(last);
}

module.exports = {
  CLOSE_MS, QUIET, asVersion, childEnv, chunked, exchange, expecting, join, loadSubject, parseResponses, prefillJournal, req, root, settled, sha256, sleep, split,
  startChild, startInProcess, until, repository,
};
