'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { publish } = require('./u060-startup-facts.cjs');
const parent = Number(process.env.C043_U060_PARENT_PID);
const directory = process.env.C043_U060_GATE_DIRECTORY;
if (directory && (process.ppid === parent || process.env.NODE_TEST_CONTEXT === 'child-v8')) {
  const token = process.env.C043_U060_START_TOKEN;
  if (!token) throw new Error('U060 startup token is required.');
  const root = process.ppid === parent;
  const gate = root ? path.join(directory, 'root.start.json') : path.join(directory, `worker-${process.pid}.start.json`);
  if (!root) publish(path.join(directory, `worker-${process.pid}.ready.json`),
    { pid: process.pid, ppid: process.ppid, token });
  const deadline = process.hrtime.bigint() + 120000000000n;
  while (!fs.existsSync(gate)) {
    if (process.hrtime.bigint() >= deadline) throw new Error('U060_STARTUP_UNDECIDED: owner identity was not established.');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
  const fact = JSON.parse(fs.readFileSync(gate, 'utf8'));
  if (fact.pid !== process.pid || fact.token !== token || fact.identityRecorded !== true) throw new Error('U060 startup identity fact differs.');
}
