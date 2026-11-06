'use strict';

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

function writeReportFile(target, document, { fsApi = fs } = {}) {
  fsApi.mkdirSync(path.dirname(target), { recursive: true });
  fsApi.writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
}

// Written before anything can fail, so a previous pass:true never outlives a run that did not finish.
function startedReport() {
  return { schema: SCHEMA, pass: false, status: 'started', message: 'the gate started and has not finished: this file is not a result' };
}

function failureReport(error) {
  const usage = error instanceof UsageError;
  const code = error && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(error.code) ? error.code : 'INTERNAL';
  return { schema: SCHEMA, pass: false, error: { code, type: usage ? 'usage' : 'internal', message: String((error && error.message) || error) } };
}

// Every value that follows a --json flag, read without validating the rest of the command line, so a usage error elsewhere still reaches the file.
function scanJsonTargets(argv) {
  const targets = [];
  argv.forEach((argument, index) => {
    const value = argv[index + 1];
    if (argument === '--json' && typeof value === 'string' && value !== '' && !value.startsWith('--')) targets.push(value);
  });
  return [...new Set(targets)];
}

module.exports = Object.freeze({ MAX_REPORT_BYTES, specialNameProblem, checkReportTarget, writeReportFile, startedReport, failureReport, scanJsonTargets });
