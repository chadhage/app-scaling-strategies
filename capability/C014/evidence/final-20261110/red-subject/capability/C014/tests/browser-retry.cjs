'use strict';

// Test tooling, not production code (review finding F13). The shared qualifyEdge() of testing\browser\qualify belongs to another card
// and asks PowerShell for the signature, the version and the hash; on a machine that other processes keep busy those queries exceed
// their own time limit and the report fails with a typed timeout code. Only that, and only ONCE, is retried: a failure that is not a
// timeout (a bad signature, an unqualified major) is final, and a second timeout is reported as the failure it is.
const os = require('node:os');

const TIMEOUT_CODES = Object.freeze(['SIGNATURE_TIMEOUT', 'VERSION_TIMEOUT', 'SHA256_TIMEOUT']);
const isTimeout = (reason) => TIMEOUT_CODES.some((code) => String(reason).startsWith(`${code}:`));
const describeLoad = () => `${Math.round(os.freemem() / 1048576)} of ${Math.round(os.totalmem() / 1048576)} MB free, ${os.cpus().length} logical processors`;

async function qualifyWithRetry(qualify, report = console.log) {
  const first = await qualify();
  if (first.ok || first.reasons.length === 0 || !first.reasons.every(isTimeout)) return { edge: first, attempts: 1 };
  report(`qualifyEdge timed out on a loaded machine (${describeLoad()}): ${first.reasons.join(' | ')}; retrying once`);
  return { edge: await qualify(), attempts: 2 };
}

module.exports = Object.freeze({ TIMEOUT_CODES, describeLoad, qualifyWithRetry });
