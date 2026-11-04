'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const pins = freeze(require('./imports.json'));
const repository = path.resolve(__dirname, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function fail(code) { throw Object.assign(new Error(code), { code }); }
function readPinned(entry) {
  if (!pins.dependencies.includes(entry)) fail('CLOSED_PIN_REQUIRED');
  const target = path.resolve(repository, entry.path);
  if (!target.startsWith(`${repository}${path.sep}capability${path.sep}`)) fail('SOURCE_PATH_SCOPE');
  let current = repository;
  for (const piece of path.relative(repository, target).split(path.sep)) {
    current = path.join(current, piece);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || fs.realpathSync(current) !== current) fail('UNSAFE_SOURCE_PATH');
  }
  const before = fs.lstatSync(target);
  if (!before.isFile() || before.nlink !== 1 || before.size > 262144) fail('UNSAFE_SOURCE_FILE');
  const fd = fs.openSync(target, fs.constants.O_RDONLY);
  let bytes;
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== before.ino ||
        opened.dev !== before.dev || opened.size !== before.size) fail('SOURCE_CHANGED');
    bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd);
    if (bytes.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) fail('SOURCE_CHANGED');
  } finally { fs.closeSync(fd); }
  if (hash(bytes) !== entry.raw || hash(normalize(bytes)) !== entry.lf) fail('SOURCE_RAW_OR_LF_PIN_MISMATCH');
  return bytes;
}
function checkImports() {
  if (arguments.length) fail('NO_SOURCE_OVERRIDES');
  const raws = pins.dependencies.map(readPinned);
  const input = pins.dependencies.map((entry) => `${pins.accepted[entry.card].commit}:${entry.path.replaceAll('\\', '/')}`).join('\n') + '\n';
  const batch = execFileSync('git', ['--no-pager', 'cat-file', '--batch'],
    { cwd: repository, input, timeout: 10000, maxBuffer: 1048576, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let offset = 0;
  const checked = pins.dependencies.map((entry, index) => {
    const end = batch.indexOf(10, offset);
    const header = batch.subarray(offset, end).toString('ascii');
    const match = /^[0-9a-f]{40} blob (\d+)$/.exec(header);
    if (!match || end < offset) fail('ACCEPTED_GIT_BLOB_REQUIRED');
    const length = Number(match[1]);
    const blob = batch.subarray(end + 1, end + 1 + length);
    offset = end + length + 2;
    if (blob.length !== length || batch[offset - 1] !== 10) fail('ACCEPTED_GIT_BLOB_REQUIRED');
    if (hash(blob) !== entry.git) fail('ACCEPTED_GIT_PIN_MISMATCH');
    const raw = raws[index];
    return { path: entry.path, workingRawSha256: hash(raw), acceptedGitSha256: hash(blob), crlfToLfSha256: hash(normalize(raw)), rawEqualsGit: raw.equals(blob) };
  });
  if (offset !== batch.length) fail('ACCEPTED_GIT_BLOB_REQUIRED');
  return checked;
}
function historicalPin(id) {
  const names = { report: 'summary.json', 'closed-history': 'reset-history.html', 'held-snapshot': 'between-reads.html' };
  if (typeof id !== 'string' || !Object.hasOwn(names, id)) fail('UNKNOWN_SAVED_SOURCE');
  return pins.dependencies.find((entry) => entry.path === path.join('capability', 'C033', 'evidence', 'raw', pins.historicalCapture, names[id]));
}
module.exports = Object.freeze({ pins, hash, normalize, checkImports, historicalPin, readPinned });
