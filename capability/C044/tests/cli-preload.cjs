'use strict';

// Test tooling, not production code: node --require preload for the real CLI child process. It replaces only
// collaborators of server.cjs: the ledger consent read (the C001-approved snapshot), the C015 context reader
// and the run's persistence directory (redirected into test scratch). The CLI code itself is the real file.
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { makePersisted, makeState } = require('../../C015/contract.cjs');
const approved = require('../../C001/approved-contract.js');

const realRead = fs.readFileSync;
fs.readFileSync = function patchedRead(file, ...rest) {
  if (typeof file === 'string' && file.endsWith('flow-state.json')) return JSON.stringify({ approvals: { C001: approved.approval } });
  return realRead.call(this, file, ...rest);
};

const realLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  const fromServer = parent && path.basename(parent.filename || '') === 'server.cjs';
  if (fromServer && request === './context.cjs') {
    const persisted = makePersisted(makeState('synthetic-run-001', 3), null);
    return { readContext: async () => ({ origin: 'injected-fixture', runId: 'synthetic-run-001', epoch: 3, stateSha256: persisted.stateSha256 }) };
  }
  if (fromServer && request === './run.cjs') {
    const real = realLoad.apply(this, arguments);
    return { ...real, createRun: (options) => real.createRun({ ...options, persistDir: process.env.C044_TEST_PERSIST_DIR || null }) };
  }
  return realLoad.apply(this, arguments);
};
