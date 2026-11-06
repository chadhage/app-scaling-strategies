'use strict';

// Test tooling, not production code: manual scheduler, real-socket SSE client, scratch directories and fixture contexts.
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { makePersisted, makeState } = require('../../C015/contract.cjs');
const { createRun } = require('../run.cjs');
const { createLocalServer } = require('../server.cjs');

const root = path.resolve(__dirname, '..');
const scratchRoot = path.join(root, 'tests', 'scratch');
const FAILSAFE_MS = 10000;

// Virtual clock: jobs run in due order when the test advances time, so no test sleeps on the wall clock.
function manualScheduler() {
  let now = 0;
  const jobs = [];
  return {
    jobs,
    every(ms, fn) {
      const job = { ms, fn, next: now + ms, active: true, repeat: true };
      jobs.push(job);
      return () => { job.active = false; };
    },
    after(ms, fn) {
      const job = { ms, fn, next: now + ms, active: true, repeat: false };
      jobs.push(job);
      return () => { job.active = false; };
    },
    advance(delta) {
      const end = now + delta;
      for (;;) {
        const due = jobs.filter((job) => job.active && job.next <= end).sort((a, b) => a.next - b.next)[0];
        if (!due) break;
        now = due.next;
        if (due.repeat) due.next += due.ms; else due.active = false;
        due.fn();
      }
      now = end;
    },
    activeJobs() { return jobs.filter((job) => job.active).length; },
  };
}

function fixtureContext(runId = 'synthetic-run-001', epoch = 3) {
  const persisted = makePersisted(makeState(runId, epoch), null);
  return { origin: 'injected-fixture', runId, epoch, stateSha256: persisted.stateSha256 };
}

function scratchDirectory() {
  const directory = path.join(scratchRoot, randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  return {
    directory,
    remove() { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); },
  };
}

async function settle(until, label = 'condition') {
  const deadline = Date.now() + FAILSAFE_MS;
  while (!until()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function startHost(options = {}) {
  const scheduler = options.scheduler || manualScheduler();
  const context = options.context || fixtureContext();
  const run = createRun({ context, scheduler, replayWindow: 8, totalSteps: 40, ...options.run });
  const server = createLocalServer({ run, scheduler, ...options.server });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    run, server, scheduler, context, port, origin: `http://127.0.0.1:${port}`,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function parseFrame(text, client) {
  const fields = {};
  for (const line of text.split('\n')) {
    if (line.startsWith(':')) client.comments.push(line);
    else if (line.includes(': ')) fields[line.slice(0, line.indexOf(': '))] = line.slice(line.indexOf(': ') + 2);
  }
  if (fields.retry !== undefined) client.retry = Number(fields.retry);
  if (fields.event) client.events.push({ id: fields.id, event: fields.event, data: JSON.parse(fields.data) });
}

function openStream(origin, route = '/stream', headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(`${origin}${route}`, { headers, agent: false }, (response) => {
      const client = {
        status: response.statusCode, headers: response.headers, events: [], comments: [], retry: null, text: '', ended: false, closed: false,
        ids() { return this.events.map((event) => event.id); },
        seqs() { return this.events.map((event) => event.data.seq); },
        destroy() { request.destroy(); response.destroy(); },
      };
      let buffer = '';
      const wake = [];
      const poke = () => wake.splice(0).forEach((fn) => fn());
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        client.text += chunk;
        buffer += chunk;
        for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
          parseFrame(buffer.slice(0, end), client);
          buffer = buffer.slice(end + 2);
        }
        poke();
      });
      response.on('end', () => { client.ended = true; poke(); });
      response.on('close', () => { client.closed = true; poke(); });
      response.on('error', () => { client.closed = true; poke(); });
      client.waitFor = (predicate, label = 'client condition') => new Promise((done, fail) => {
        const timer = setTimeout(() => fail(new Error(`Timed out waiting for ${label}`)), FAILSAFE_MS);
        const check = () => {
          if (predicate(client)) { clearTimeout(timer); done(client); } else wake.push(check);
        };
        check();
      });
      client.json = async () => { await client.waitFor((value) => value.ended || value.closed, 'response end'); return JSON.parse(client.text); };
      resolve(client);
    });
    request.on('error', reject);
  });
}

// Raw TCP client: sends one HTTP request head and exposes every byte received, so a test can stop reading or cut mid-frame.
function rawConnect(port, route = '/stream', headers = {}, { pause = false } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const state = { socket, received: '', closed: false };
    const wake = [];
    const poke = () => wake.splice(0).forEach((fn) => fn());
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => { state.received += chunk; poke(); });
    socket.on('close', () => { state.closed = true; poke(); });
    socket.on('error', () => { state.closed = true; poke(); });
    state.waitFor = (predicate, label = 'raw condition') => new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error(`Timed out waiting for ${label}`)), FAILSAFE_MS);
      const check = () => {
        if (predicate(state)) { clearTimeout(timer); done(state); } else wake.push(check);
      };
      check();
    });
    socket.once('connect', () => {
      const head = [`GET ${route} HTTP/1.1`, `Host: 127.0.0.1:${port}`, ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`), '', ''];
      socket.write(head.join('\r\n'));
      if (pause) socket.pause();
      resolve(state);
    });
    socket.once('error', reject);
  });
}

// Minimal TCP proxy so a test can drop connections the way an idle-timeout proxy does.
async function startProxy(targetPort) {
  const sockets = new Set();
  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, '127.0.0.1');
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => sockets.delete(socket));
    }
    client.pipe(upstream);
    upstream.pipe(client);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    dropAll() { for (const socket of [...sockets]) socket.destroy(); },
    async close() {
      this.dropAll();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = Object.freeze({
  root, scratchRoot, manualScheduler, fixtureContext, scratchDirectory, settle, startHost, openStream, rawConnect, startProxy,
});
