'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { buildEnvironment } = require('../command.cjs');
const { killTree } = require('../runner.cjs');
const { makeScratch, dispose, writeTree } = require('./support.cjs');

const namespace = path.resolve(__dirname, '..');
const subject = path.resolve(process.env.U041_SUBJECT_ROOT || namespace);
const load = (file) => require(path.join(subject, file));

function startNode(args, { cwd = namespace, env = {} } = {}) {
  const child = spawn(process.execPath, args, {
    cwd, env: buildEnvironment(process.env, env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (bytes) => stdout.push(bytes));
  child.stderr.on('data', (bytes) => stderr.push(bytes));
  const done = new Promise((resolve) => {
    child.on('error', (error) => stderr.push(Buffer.from(error.message)));
    child.on('close', (status, signal) => resolve({
      status, signal, pid: child.pid, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8')
    }));
  });
  const close = async () => {
    if (child.exitCode === null && child.signalCode === null && child.pid) killTree(child.pid);
    return done;
  };
  return { child, done, close };
}

async function startBarrier() {
  const peers = new Map();
  const waiting = new Map();
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let text = '';
    socket.on('data', (bytes) => {
      text += bytes.toString('utf8');
      if (!text.includes('\n')) return;
      const label = text.slice(0, text.indexOf('\n'));
      peers.set(label, socket);
      waiting.get(label)?.();
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const ready = (label) => peers.has(label) ? Promise.resolve() : new Promise((resolve) => waiting.set(label, resolve));
  const release = (label) => peers.get(label).end('go\n');
  const close = async () => {
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  };
  return { port: server.address().port, ready, release, close };
}

function passingFixture(root, barrier = false) {
  return writeTree(root, {
    'lib.cjs': "'use strict';\nmodule.exports = (value) => value ? 1 : 2;\n",
    'tests/pass.test.cjs': [
      "'use strict';",
      "const test = require('node:test');",
      "const assert = require('node:assert/strict');",
      "const f = require('../lib.cjs');",
      "test('actual passing namespace measurement', async () => {",
      ...(barrier ? [
        "  const net = require('node:net');",
        "  await new Promise((resolve, reject) => {",
        "    const socket = net.connect(Number(process.env.U041_BARRIER_PORT), '127.0.0.1');",
        "    socket.once('connect', () => socket.write(`${process.env.U041_LABEL}\\n`));",
        "    socket.once('error', reject);",
        "    socket.once('end', resolve);",
        "    socket.resume();",
        "  });"
      ] : []),
      '  assert.equal(f(true), 1);',
      '  assert.equal(f(false), 2);',
      '});',
      ''
    ].join('\n')
  });
}

module.exports = Object.freeze({ fs, path, namespace, subject, load, startNode, startBarrier, passingFixture, makeScratch, dispose });
