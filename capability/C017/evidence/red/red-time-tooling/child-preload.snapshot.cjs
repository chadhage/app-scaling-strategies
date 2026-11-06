'use strict';

// Test tooling, not production code: node --require preload for the REAL cli.cjs child process. It replaces only
// collaborators: the ledger consent read (the C001-approved snapshot, so the real C001 guard still runs) and, when
// C017_MEM_FILE is set, writes the child's own garbage-collected heap numbers so the parent can bound memory.
const fs = require('node:fs');
const approved = require('../../../C001/approved-contract.js');

const realRead = fs.readFileSync;
const realWrite = fs.writeFileSync;
fs.readFileSync = function patchedRead(file, ...rest) {
  if (typeof file === 'string' && file.endsWith('flow-state.json')) return JSON.stringify({ approvals: { C001: approved.approval } });
  return realRead.call(this, file, ...rest);
};

if (process.env.C017_MEM_FILE) {
  const sample = () => {
    if (global.gc) global.gc();
    const { heapUsed, rss } = process.memoryUsage();
    try { realWrite.call(fs, process.env.C017_MEM_FILE, JSON.stringify({ heapUsed, rss })); } catch { /* the parent may be removing the folder */ }
  };
  setInterval(sample, 100).unref();
  sample();
}

// When C017_LAG_FILE is set the child appends its own event-loop delay (perf_hooks, 10 ms resolution) every 100 ms: the only place a
// stall of THIS process can be measured (L-0138). A starved loop writes the late sample as soon as it runs again.
if (process.env.C017_LAG_FILE) {
  const { monitorEventLoopDelay } = require('node:perf_hooks');
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  setInterval(() => {
    const maxMs = Math.round(delay.max / 1e4) / 100;
    delay.reset();
    try { fs.appendFileSync(process.env.C017_LAG_FILE, `${JSON.stringify({ t: Date.now(), maxMs })}\n`); } catch { /* the parent may be removing the folder */ }
  }, 100).unref();
}
