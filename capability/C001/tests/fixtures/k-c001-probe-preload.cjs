'use strict';
// K-C001 test fixture: a node --require preload for the REAL capability\C001\probe.cjs command line (tests only; never production code).
// It serves the ledger from memory, so no test reads .docs\wiki\flow-state.json, and it injects at most one fault into a collaborator.
//   K_C001_LEDGER_PATH   the one path the probe may ask for (the preload throws for any other flow-state.json path)
//   K_C001_LEDGER_TEXT   the text served for that path; K_C001_LEDGER_ERROR (ENOENT or EACCES) makes the read fail instead
//   K_C001_FAULT         reject | throw | empty | bigint (the guard misbehaves) or console (console.log throws)
// Without a ledger text and error the ledger is unreadable (fail closed). The preload never writes to standard output or error.
const fs = require('node:fs');
const path = require('node:path');

const SECRET = 'k-c001-secret-detail';
const expected = path.resolve(process.env.K_C001_LEDGER_PATH || 'ledger-path-not-given').toLowerCase();
const original = fs.readFileSync;

function unreadable(file, code) {
  return Object.assign(new Error(`${code}: cannot read '${file}' ${SECRET}`), { code, syscall: 'open', path: file });
}

fs.readFileSync = function readFileSync(file, options) {
  if (typeof file !== 'string' || path.basename(file).toLowerCase() !== 'flow-state.json') return original.apply(this, arguments);
  if (path.resolve(file).toLowerCase() !== expected) throw unreadable(file, 'EUNEXPECTED');
  const text = process.env.K_C001_LEDGER_TEXT;
  if (text === undefined) throw unreadable(file, process.env.K_C001_LEDGER_ERROR || 'ENOENT');
  const encoding = typeof options === 'string' ? options : options && options.encoding;
  return encoding ? text : Buffer.from(text);
};

const fault = process.env.K_C001_FAULT;
if (fault === 'console') {
  console.log = () => { throw new Error(SECRET); };
} else if (fault) {
  const guardPath = require.resolve('../../contract-guard.js');
  const real = require(guardPath);
  const guards = {
    reject: async () => { throw new Error(SECRET); },
    throw: () => { throw new Error(SECRET); },
    empty: async () => undefined,
    bigint: async (action, approval) => ({ ...(await real.guardOperation(action, approval)), unserializable: 1n })
  };
  if (!Object.hasOwn(guards, fault)) throw new Error(`unknown K_C001_FAULT ${fault}`);
  require.cache[guardPath].exports = Object.freeze({ ...real, guardOperation: guards[fault] });
}
