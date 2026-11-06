'use strict';

// Test-only collaborators for the C020 CLI child process (node --require): a private ledger reader, and a stdin-driven
// stand-in for the OS signal, because Windows cannot deliver SIGINT or SIGTERM handlers to a child. server.cjs is not touched.
const fs = require('node:fs');
const path = require('node:path');

const ledger = path.resolve(process.env.K_C020_LEDGER_FILE).toLowerCase();
const originalRead = fs.readFileSync;
fs.readFileSync = function readFileSync(file, ...rest) {
  if (path.resolve(String(file)).toLowerCase() === ledger) {
    if (process.env.K_C020_LEDGER_MODE === 'missing') {
      throw Object.assign(new Error('ENOENT: the private ledger is absent'), { code: 'ENOENT' });
    }
    return process.env.K_C020_LEDGER_JSON;
  }
  return originalRead.call(this, file, ...rest);
};

process.stdin.setEncoding('utf8');
process.stdin.on('data', (text) => { for (const name of text.split(/\s+/).filter(Boolean)) process.emit(name); });
process.stdin.unref();
