'use strict';

// Test tooling, not production code: starts server-child.cjs (a disposable server process) and talks to it over IPC. The PID is recorded
// and only this process is ever stopped (a graceful close first, then by PID); a hard timeout ends a child that never answers.
const path = require('node:path');
const { spawn } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'server-child.cjs');

// The environment of a test child: the test runner's own variables never reach it. NODE_TEST_CONTEXT would make the child believe it runs inside
// the parent's runner. NODE_V8_COVERAGE would make it write a V8 coverage file into the parent's coverage directory, and a child that is killed
// leaves a truncated file there that fails the whole coverage report ("Unexpected end of JSON input"). NOTE: deleting NODE_V8_COVERAGE from the
// copy of the environment does NOT help: Node itself adds the parent's value to every child's environment unless the environment handed to the
// child has a property of that name of its own (lib/child_process.js: "process.env.NODE_V8_COVERAGE always propagates"). An EMPTY value is such a
// property, and a child reads it as "no coverage". Every spawn of a node child from a test uses this.
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  env.NODE_V8_COVERAGE = '';
  return env;
}

function startChild({ mode = 'real', heapMb = 0, hardMs = 180000, extraEnv = {} } = {}) {
  const env = childEnv({ C022_MODE: mode, ...extraEnv });
  const args = [...(heapMb ? [`--max-old-space-size=${heapMb}`] : []), SCRIPT];
  const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true });
  const hard = setTimeout(() => child.kill('SIGKILL'), hardMs);
  hard.unref();
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const receive = (type, ms = 60000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.off('message', listener); reject(new Error(`no ${type} message from the server child within ${ms} ms`)); }, ms);
    const listener = (message) => { if (message.type === type) { clearTimeout(timer); child.off('message', listener); resolve(message); } };
    child.on('message', listener);
    child.once('exit', () => { clearTimeout(timer); reject(new Error(`the server child ended before it sent ${type}`)); });
  });
  return {
    pid: child.pid, child, exited, receive,
    ask(message, type, ms) { const answer = receive(type, ms); child.send(message); return answer; },
    async stop() {
      clearTimeout(hard);
      if (child.exitCode === null && child.connected) child.send('close');
      const timer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 15000);
      await exited;
      clearTimeout(timer);
    }
  };
}

module.exports = Object.freeze({ childEnv, startChild });
