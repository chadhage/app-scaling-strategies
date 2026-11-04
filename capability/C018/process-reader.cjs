'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseJsonInput } = require('..\\C002\\json-input.js');
const { runIds, fail } = require('..\\C015\\contract.cjs');
const { resolveNamespace } = require('..\\C015\\paths.cjs');
const { checkObservation } = require('./inspection.js');

class ReaderError extends Error {
  constructor(code, message, details = [], pid = null) {
    super(message);
    this.name = 'C018ReaderError';
    this.code = code;
    this.details = details;
    this.pid = pid;
  }
}

async function readFresh(namespace, runId) {
  if (arguments.length !== 2) fail('INVALID_ARGUMENTS', 'A fresh read requires exactly namespace and run ID.');
  resolveNamespace(namespace);
  if (!runIds.includes(runId)) fail('UNKNOWN_RUN_ID', 'Supply an exact named C015 synthetic run ID; no default or coercion.');
  const child = spawnSync(process.execPath, [path.join(__dirname, 'fresh-reader.cjs'), namespace, runId], {
    encoding: 'utf8', timeout: 90000, maxBuffer: 262144, windowsHide: true,
  });
  if (child.error || child.signal || ![0, 1].includes(child.status)) {
    throw new ReaderError('READER_UNAVAILABLE', 'The actual fresh reader did not complete; current progress is unknown.',
      [{ code: child.error?.code || child.signal || `EXIT_${child.status}` }], child.pid || null);
  }
  const output = child.status === 0 ? child.stdout : child.stderr;
  const parsed = parseJsonInput(output, 'fresh-reader');
  if (parsed.errors.length || (child.status === 0 && child.stderr.trim()) ||
      (child.status !== 0 && child.stdout.trim())) {
    throw new ReaderError('READER_PROTOCOL', 'The fresh reader returned invalid or ambiguous output, not progress.', parsed.errors, child.pid);
  }
  const value = parsed.value;
  if (child.status !== 0) {
    if (!value || value.restored !== false || typeof value.code !== 'string' ||
        typeof value.message !== 'string' || !Array.isArray(value.details) || value.pid !== child.pid) {
      throw new ReaderError('READER_PROTOCOL', 'The fresh reader did not return an explicit correlated error.', [], child.pid);
    }
    throw new ReaderError(value.code, value.message, value.details, value.pid);
  }
  checkObservation(value, runId);
  if (value.namespace !== namespace || value.pid !== child.pid) {
    throw new ReaderError('READER_IDENTITY', 'The reader receipt does not match the requested namespace and actual child PID.', [], child.pid);
  }
  return value;
}

module.exports = Object.freeze({ readFresh, ReaderError });
