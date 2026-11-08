'use strict';

const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseResponses } = require('./u040-support.cjs');

async function child(mode) {
  delete process.env.NODE_V8_COVERAGE;
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  delete environment.NODE_V8_COVERAGE;
  delete environment.CAPTURE_BROWSER_EVIDENCE;
  const processHandle = spawn(process.execPath, [path.join(__dirname, 'u055-boundary-child.cjs'), mode], {
    env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  const messages = [];
  const waiters = new Set();
  const errors = [];
  let exitValue = null;
  processHandle.stderr.on('data', (chunk) => errors.push(chunk));
  processHandle.on('message', (message) => {
    messages.push(message);
    for (const entry of [...waiters]) {
      if (entry.predicate(message)) { waiters.delete(entry); entry.resolve(message); }
    }
  });
  const exited = new Promise((resolve) => processHandle.once('exit', (code, signal) => {
    exitValue = { code, signal };
    for (const entry of waiters) entry.reject(new Error('The owned boundary fixture exited before its barrier.'));
    waiters.clear();
    resolve(exitValue);
  }));
  const wait = (predicate) => new Promise((resolve, reject) => {
    const found = messages.find(predicate);
    if (found) resolve(found);
    else if (exitValue !== null) reject(new Error('The owned boundary fixture has exited.'));
    else waiters.add({ predicate, resolve, reject });
  });
  let closing;
  const close = () => {
    closing ??= (async () => {
      if (exitValue !== null) return exitValue;
      processHandle.send({ type: 'stop' });
      const guard = setTimeout(() => processHandle.kill(), 15000);
      try { return await exited; } finally { clearTimeout(guard); }
    })();
    return closing;
  };
  try {
    const ready = await wait((message) => message.type === 'ready');
    return {
      port: ready.port, pid: processHandle.pid, wait, close, exited: () => exitValue,
      send: (message) => processHandle.send(message),
      stderr: () => Buffer.concat(errors).toString('utf8')
    };
  } catch (error) {
    await close();
    throw error;
  }
}

async function peer(port) {
  const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: true });
  const chunks = [];
  const ended = new Promise((resolve) => {
    const finish = () => {
      socket.destroy();
      resolve(parseResponses(Buffer.concat(chunks)).map((response) => response.status));
    };
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.once('end', finish);
    socket.once('close', finish);
    socket.on('error', () => {});
  });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
  return { socket, port: socket.localPort, ended };
}

module.exports = Object.freeze({ child, peer });
