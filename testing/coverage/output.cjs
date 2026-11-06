'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { UsageError } = require('./errors.cjs');
const { SCHEMA } = require('./evaluate.cjs');
const { MEASURABLE, UNMEASURABLE } = require('./enumerate.cjs');

const MAX_REPORT_BYTES = 32 * 1024 * 1024;
// Windows opens these names as devices in every folder and with any extension (nul.json is the null device): a report written there never reaches a file.
const DEVICE_NAME = /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])$/i;
const DEVICE_PREFIX = /^(?:\\\\|\/\/)[.?][\\/]/;
const SCRIPT_EXTENSIONS = new Set([...MEASURABLE, ...UNMEASURABLE]);
// A read-only previous report cannot be replaced by a rename; it is removed first and the rename is tried again.
const REPLACE_RETRY = new Set(['EPERM', 'EACCES']);

function refuse(target, why) {
  return new UsageError(`--json ${target} is refused: ${why}.`);
}

// Why a name can never be a plain report file, or null.
function specialNameProblem(target) {
  if (target === '' || target.includes('\0')) return 'it is not a usable path';
  if (DEVICE_PREFIX.test(target)) return 'it is a device namespace path';
  const withoutDrive = /^[A-Za-z]:/.test(target) ? target.slice(2) : target;
  if (withoutDrive.includes(':')) return 'a colon names an alternate data stream, not a file';
  const segments = target.split(/[\\/]/).filter((segment) => segment !== '');
  for (const segment of segments) {
    if (DEVICE_NAME.test(segment.split('.')[0].trim())) return `${segment} is a reserved device name`;
  }
  const last = segments[segments.length - 1] || '';
  if (/[. ]$/.test(last)) return 'Windows drops a trailing dot or space from the name';
  return null;
}

// The rule for --json: only a new file or a previous gate report (JSON that carries this gate's schema) is ever replaced. A source file, any
// other existing file, a directory, a link, a device name and a script name are refused before anything is written (F5 of the U009 review).
function checkReportTarget(target, { fsApi = fs } = {}) {
  const problem = specialNameProblem(target);
  if (problem !== null) throw refuse(target, problem);
  if (SCRIPT_EXTENSIONS.has(path.extname(target).toLowerCase())) {
    throw refuse(target, 'it is named like a script, so the report would be enumerated as production code: use a .json name');
  }
  let stat;
  try {
    stat = fsApi.lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw refuse(target, `it cannot be inspected (${error.code || error.message})`);
  }
  if (stat.isSymbolicLink()) throw refuse(target, 'it is a link');
  if (stat.isDirectory()) throw refuse(target, 'it is a directory');
  if (!stat.isFile()) throw refuse(target, 'it is not a regular file');
  if (stat.nlink > 1) throw refuse(target, 'it has more than one hard link, so writing it could change another file');
  if (stat.size > MAX_REPORT_BYTES) throw refuse(target, 'it is too large to be a gate report');
  let document = null;
  try {
    document = JSON.parse(fsApi.readFileSync(target, 'utf8'));
  } catch {
    document = null;
  }
  if (document === null || typeof document !== 'object' || document.schema !== SCHEMA) {
    throw refuse(target, `the existing file is not a previous gate report (it has no schema ${SCHEMA}); remove it or choose another path`);
  }
}

// The identity of a file that survives nothing but itself: volume and file id as BigInt text, so that no digit of a 64-bit id is lost.
const identityOf = (stat) => `${stat.dev}:${stat.ino}`;

function changed(target, why) {
  return Object.assign(new Error(`--json ${target} changed while the gate ran: ${why}`), { code: 'REPORT_CHANGED' });
}

// Immediately before the final write: the path must still hold the file the gate wrote (a regular file, one link, a gate report, the same identity).
// A path that was removed in the meantime is simply written again.
function verifyUnchanged(target, expected, fsApi) {
  try {
    checkReportTarget(target, { fsApi });
  } catch (error) {
    throw changed(target, error.message);
  }
  let stat;
  try {
    stat = fsApi.lstatSync(target, { bigint: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (identityOf(stat) !== expected) throw changed(target, 'it is no longer the file the gate wrote');
}

function replace(temp, target, fsApi) {
  try {
    fsApi.renameSync(temp, target);
  } catch (error) {
    if (!REPLACE_RETRY.has(error.code)) throw error;
    fsApi.unlinkSync(target);
    fsApi.renameSync(temp, target);
  }
}

// Every write goes to a new temporary file beside the target (exclusive create) and replaces the target by rename, so a hard link that someone put at the
// target name is replaced and never written through (N4 of the second review). With `expected`, the identity that the earlier write returned, the target
// is checked again right before. Returns the identity of the file that now holds the report. A process with write access to the folder can still swap
// the name between that check and the rename: that cannot be made atomic, but the swap can no longer redirect the write into another file.
// `suffix` names the temporary file (injectable so that the exclusive create can be tested).
function writeReportFile(target, document, { fsApi = fs, expected = null, suffix = () => crypto.randomBytes(4).toString('hex') } = {}) {
  fsApi.mkdirSync(path.dirname(target), { recursive: true });
  if (expected !== null) verifyUnchanged(target, expected, fsApi);
  const temp = `${target}.${process.pid}-${suffix()}.tmp`;
  fsApi.writeFileSync(temp, `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx' });
  try {
    replace(temp, target, fsApi);
  } catch (error) {
    try {
      fsApi.unlinkSync(temp);
    } catch {
      // the temporary file is already gone
    }
    throw error;
  }
  return identityOf(fsApi.lstatSync(target, { bigint: true }));
}

// Written before anything can fail, so a previous pass:true never outlives a run that did not finish.
function startedReport() {
  return { schema: SCHEMA, pass: false, status: 'started', message: 'the gate started and has not finished: this file is not a result' };
}

// For a command that measured nothing (--help next to --json): the path must not keep an earlier pass either.
function notRunReport(message) {
  return { schema: SCHEMA, pass: false, status: 'not-run', message };
}

function failureReport(error) {
  const usage = error instanceof UsageError;
  const code = error && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(error.code) ? error.code : 'INTERNAL';
  return { schema: SCHEMA, pass: false, error: { code, type: usage ? 'usage' : 'internal', message: String((error && error.message) || error) } };
}

// Every value that follows a --json flag or sits after --json=, read without validating the rest of the command line, so a usage error elsewhere still
// reaches the file. Only these two spellings are known: another spelling is an unknown argument and names no path.
function scanJsonTargets(argv) {
  const targets = [];
  argv.forEach((argument, index) => {
    const value = argv[index + 1];
    if (argument === '--json' && typeof value === 'string' && value !== '' && !value.startsWith('--')) targets.push(value);
    else if (typeof argument === 'string' && argument.startsWith('--json=') && argument.length > '--json='.length) targets.push(argument.slice('--json='.length));
  });
  return [...new Set(targets)];
}

module.exports = Object.freeze({ MAX_REPORT_BYTES, specialNameProblem, checkReportTarget, writeReportFile, startedReport, notRunReport, failureReport, scanJsonTargets });
