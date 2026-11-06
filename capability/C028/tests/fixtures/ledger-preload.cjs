'use strict';

// Test tooling: a node --require preload that answers reads of the live ledger with a fixture ledger holding only the
// approved C001 consent record, so CLI process tests never depend on the mutable ledger. C028_FIXTURE_APPROVAL can name a
// variant: "drift" changes the approval, "missing" removes it.
const fs = require('node:fs');
const path = require('node:path');
const approved = require(path.join(__dirname, '..', '..', '..', 'C001', 'approved-contract.js'));

const variant = process.env.C028_FIXTURE_APPROVAL;
const approval = variant === 'drift' ? { ...approved.approval, expenditureApproved: true } : approved.approval;
const ledger = JSON.stringify({ approvals: variant === 'missing' ? {} : { C001: approval } });
const original = fs.readFileSync;
fs.readFileSync = function readFileSync(file, ...rest) {
  if (typeof file === 'string' && file.endsWith('flow-state.json')) return ledger;
  return original.call(this, file, ...rest);
};
