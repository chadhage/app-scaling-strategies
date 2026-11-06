'use strict';

// Test tooling, not production code: the parent side of the resource-bound probes. It starts the disposable server child with a
// small heap under a hard external timeout (the child is killed by PID when the timer fires) and hands out raw TCP clients that
// never read unless a probe asks them to. Every client is destroyed by destroyAll(), which each probe calls in finally.
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const childPath = path.join(__dirname, 'resource-child.cjs');

function startChild({ heapMb = 48, hardMs = 90000, script = childPath, args = ['--expose-gc'] } = {}) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const child = spawn(process.execPath, [`--max-old-space-size=${heapMb}`, ...args, script], { env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(0, 2000); });
  const inbox = [];
  const waiting = new Set();
  child.on('message', (message) => {
    inbox.push(message);
    for (const check of [...waiting]) check();
  });
  const hard = setTimeout(() => child.kill('SIGKILL'), hardMs);
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => { clearTimeout(hard); resolve({ code, signal, stderr }); }));
  function receive(type, ms = 10000) {
    return new Promise((resolve, reject) => {
      const fail = (reason) => { waiting.delete(check); reject(new assert.AssertionError({ message: `no ${type} message from the server child: ${reason}; stderr: ${stderr}` })); };
      const timer = setTimeout(() => fail(`not within ${ms} ms`), ms);
      exited.then((end) => { clearTimeout(timer); fail(`the child ended first (exit ${end.code}, signal ${end.signal})`); });
      function check() {
        const index = inbox.findIndex((message) => message.type === type);
        if (index === -1) return;
        clearTimeout(timer);
        waiting.delete(check);
        resolve(inbox.splice(index, 1)[0]);
      }
      waiting.add(check);
      check();
    });
  }
  return {
    child, exited, receive,
    ask(message, type, ms) { child.send(message); return receive(type, ms); },
    stop() { clearTimeout(hard); if (child.exitCode === null) child.kill('SIGKILL'); }
  };
}

function clients(port) {
  const sockets = [];
  return {
    sockets,
    // A client never reads unless the probe asks for it (read: true), so the server's answers pile up on its side.
    open(bytes, { read = false } = {}) {
      const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: true });
      socket.on('error', () => {});
      sockets.push(socket);
      if (read) {
        socket.resume();
        socket.on('end', () => socket.destroy());
      }
      if (bytes !== undefined) socket.write(bytes);
      return socket;
    },
    destroyed: () => sockets.filter((socket) => socket.destroyed).length,
    destroyAll: () => sockets.forEach((socket) => socket.destroy())
  };
}

const within = (promise, label, ms) => {
  let timer;
  const late = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new assert.AssertionError({ message: `${label} did not happen within ${ms} ms` })), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
};

module.exports = Object.freeze({ startChild, clients, within });
