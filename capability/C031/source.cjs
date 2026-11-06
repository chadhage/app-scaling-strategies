'use strict';

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { createHash } = require('node:crypto');
const repository = path.resolve(__dirname, '..', '..');
const MAX_SOURCE_BYTES = 262144;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function fail(code) { throw Object.assign(new Error(code), { code }); }
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const pins = freeze(require('./imports.json'));

// Reads one closed, pinned file read-only. Accepts the working bytes as checked out (raw) or as stored (LF); both must hash to the pin.
function readPinned(relative) {
  const entry = [...pins.dependencies, ...pins.own].find((pin) => pin.path === relative);
  if (!entry) fail('CLOSED_SOURCE_PIN');
  const target = path.join(repository, entry.path);
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) fail('SOURCE_FILE');
  const bytes = fs.readFileSync(target);
  const lf = entry.crlfToLfSha256 || entry.rawSha256;
  if (hash(normalize(bytes)) !== lf || ![entry.rawSha256, lf].includes(hash(bytes))) fail('SOURCE_PIN_MISMATCH');
  return bytes;
}
function checkImports() {
  if (arguments.length) fail('NO_SOURCE_OVERRIDES');
  const raw = pins.dependencies.map((entry) => readPinned(entry.path));
  const input = `${pins.dependencies.map((entry) => `${pins.accepted[entry.card].commit}:${entry.path.replaceAll('\\', '/')}`).join('\n')}\n`;
  const batch = childProcess.execFileSync('git', ['--no-pager', 'cat-file', '--batch'], {
    cwd: repository, input, timeout: 15000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
  });
  let offset = 0;
  const result = pins.dependencies.map((entry, index) => {
    const end = batch.indexOf(10, offset);
    const header = end < 0 ? null : /^[0-9a-f]{40} blob (\d+)$/.exec(batch.subarray(offset, end).toString('ascii'));
    if (!header) fail('ACCEPTED_GIT_BLOB');
    const length = Number(header[1]);
    const git = batch.subarray(end + 1, end + 1 + length);
    offset = end + length + 2;
    if (git.length !== length || hash(git) !== entry.acceptedGitSha256) fail('ACCEPTED_GIT_PIN');
    return {
      path: entry.path, rawSha256: hash(raw[index]), crlfToLfSha256: hash(normalize(raw[index])),
      acceptedGitSha256: hash(git), rawEqualsGit: raw[index].equals(git)
    };
  });
  if (offset !== batch.length) fail('ACCEPTED_GIT_BLOB');
  return freeze(result);
}
function readC034Bundle() {
  if (arguments.length) fail('NO_SOURCE_OVERRIDES');
  const relative = `capability\\C034\\evidence\\raw\\${pins.acceptedDecoderBundle}\\bundle.json`;
  return freeze(JSON.parse(readPinned(relative).toString('utf8')));
}
function checkOwnBundle() {
  if (arguments.length) fail('NO_SOURCE_OVERRIDES');
  readPinned('capability\\C031\\saved.js');
  return true;
}
function catalog() {
  if (arguments.length) fail('NO_SOURCE_OVERRIDES');
  checkOwnBundle();
  return require('.\\evaluator.js').create({ saved: require('.\\saved.js'), c034: readC034Bundle() });
}
module.exports = Object.freeze({ pins, hash, normalize, readPinned, checkImports, readC034Bundle, checkOwnBundle, catalog });
