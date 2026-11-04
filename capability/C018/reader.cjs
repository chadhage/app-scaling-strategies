'use strict';

const { restore } = require('..\\C015\\store.cjs');
const { fail } = require('..\\C015\\contract.cjs');

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

async function reopen(namespace, runId) {
  if (arguments.length !== 2) fail('INVALID_ARGUMENTS', 'Supply exactly an explicit C015 namespace and run ID; no defaults or overrides.');
  return freeze(await restore(namespace, runId));
}

module.exports = Object.freeze({ reopen });
