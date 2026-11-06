'use strict';

// Fixture process for the real-process tests (test tooling, not production code).
// Every process connects back to the test over loopback and exits when that connection closes, so nothing
// can outlive a crashed test; a time-to-live is the second safety net. Children are spawned detached on purpose:
// libuv puts a non-detached child in a kill-on-close job of its parent, which would end the whole subtree the moment
// its parent dies and make the orphan scenario and the terminated/already-gone split depend on timing.
//   root  spawns branch A, branch B and trunk C      branch X spawns leaf X1
//   trunk spawns leaf C1 and exits only when told, which makes C1 an orphan
//   leaf, idle: do nothing

const net = require('node:net');
const { spawn } = require('node:child_process');

const options = {};
for (const argument of process.argv.slice(2)) {
  const at = argument.indexOf('=');
  if (argument.startsWith('--') && at > 2) options[argument.slice(2, at)] = argument.slice(at + 1);
}

const plan = {
  root: [['branch', 'A'], ['branch', 'B'], ['trunk', 'C']],
  branch: [['leaf', `${options.name}1`]],
  trunk: [['leaf', `${options.name}1`]],
};

function startChild(role, name) {
  const args = [__filename, `--role=${role}`, `--name=${name}`, `--port=${options.port}`, `--run=${options.run}`];
  if (options.marker) args.push(`--marker=${options.marker}`);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  spawn(process.execPath, args, { stdio: 'ignore', windowsHide: true, detached: true, env }).on('error', () => process.exit(4));
}

const socket = net.connect({ host: '127.0.0.1', port: Number(options.port) });
let buffered = '';
socket.setNoDelay(true);
socket.on('connect', () => {
  for (const [role, name] of plan[options.role] || []) startChild(role, name);
  socket.write(`${JSON.stringify({
    type: 'hello', name: options.name, role: options.role, pid: process.pid, ppid: process.ppid,
    startedAtMs: Math.round(Date.now() - process.uptime() * 1000), marker: options.marker || null,
  })}\n`);
});
socket.on('data', (chunk) => {
  buffered += chunk.toString('utf8');
  for (let at = buffered.indexOf('\n'); at >= 0; at = buffered.indexOf('\n')) {
    const line = buffered.slice(0, at);
    buffered = buffered.slice(at + 1);
    const message = JSON.parse(line);
    if (message.cmd === 'ping') socket.write(`${JSON.stringify({ type: 'pong', name: options.name })}\n`);
    if (message.cmd === 'exit') process.exit(0);
  }
});
socket.on('close', () => process.exit(0));
socket.on('error', () => process.exit(0));
setTimeout(() => process.exit(3), 120000);
