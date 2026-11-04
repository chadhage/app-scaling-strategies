'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repository = path.resolve(__dirname, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function fail(code) { throw Object.assign(new Error(code), { code }); }
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const pins = freeze(require('./imports.json'));
function readFile(relative, maxBytes = 1048576) {
  const target = path.resolve(repository, relative);
  if (typeof relative !== 'string' || path.isAbsolute(relative) ||
      !target.startsWith(`${repository}${path.sep}capability${path.sep}`)) fail('SOURCE_SCOPE');
  let current = repository;
  for (const piece of path.relative(repository, target).split(path.sep)) {
    current = path.join(current, piece);
    if (fs.lstatSync(current).isSymbolicLink() || fs.realpathSync(current) !== current) fail('SOURCE_LINK');
  }
  const before = fs.lstatSync(target);
  if (!before.isFile() || before.nlink !== 1 || before.size > maxBytes) fail('SOURCE_FILE');
  const fd = fs.openSync(target, fs.constants.O_RDONLY);
  let bytes;
  try {
    const opened = fs.fstatSync(fd);
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size ||
        !opened.isFile() || opened.nlink !== 1) fail('SOURCE_CHANGED');
    bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd);
    if (bytes.length !== before.size || after.mtimeMs !== before.mtimeMs ||
        after.size !== before.size || fs.realpathSync(target) !== target) fail('SOURCE_CHANGED');
  } finally { fs.closeSync(fd); }
  return bytes;
}
function readPinned(entry) {
  if (!pins.dependencies.includes(entry)) fail('CLOSED_SOURCE_PIN');
  const bytes = readFile(entry.path);
  if (hash(bytes) !== entry.rawSha256 || hash(normalize(bytes)) !== entry.crlfToLfSha256) fail('SOURCE_PIN_MISMATCH');
  return bytes;
}
function checkImports() {
  if (arguments.length) fail('NO_SOURCE_OVERRIDES');
  const raw = pins.dependencies.map(readPinned);
  const input = pins.dependencies.map((entry) =>
    `${pins.accepted[entry.card].commit}:${entry.path.replaceAll('\\', '/')}`).join('\n') + '\n';
  const batch = execFileSync('git', ['--no-pager', 'cat-file', '--batch'], {
    cwd: repository, input, timeout: 15000, maxBuffer: 4 * 1024 * 1024,
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
  });
  let offset = 0;
  const result = pins.dependencies.map((entry, index) => {
    const end = batch.indexOf(10, offset);
    const match = /^[0-9a-f]{40} blob (\d+)$/.exec(batch.subarray(offset, end).toString('ascii'));
    if (!match || end < offset) fail('ACCEPTED_GIT_BLOB');
    const length = Number(match[1]);
    const git = batch.subarray(end + 1, end + 1 + length);
    offset = end + length + 2;
    if (git.length !== length || batch[offset - 1] !== 10 || hash(git) !== entry.acceptedGitSha256) fail('ACCEPTED_GIT_PIN');
    return {
      path: entry.path, rawSha256: hash(raw[index]), crlfToLfSha256: hash(normalize(raw[index])),
      acceptedGitSha256: hash(git), rawEqualsGit: raw[index].equals(git)
    };
  });
  if (offset !== batch.length) fail('ACCEPTED_GIT_BLOB');
  return freeze(result);
}
function readGates() {
  if (arguments.length) fail('NO_GATE_OVERRIDES');
  const bytes = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
    '-File', path.join(__dirname, 'read-gates.ps1')], {
    cwd: repository, timeout: 40000, maxBuffer: 32768, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  const gates = JSON.parse(bytes.toString('utf8'));
  if (gates.literalLocalConsent !== true || gates.readHandlesClosedBeforeRelease !== true ||
      gates.mutex !== 'Local\\AppScalingStrategies_KanbanState_v1' || gates.cards.length !== 4) fail('GATE_READ');
  for (const card of gates.cards) {
    const expected = pins.accepted[card.id];
    if (!expected || card.state !== 'Done' || card.publication.commit !== expected.commit ||
        card.publication.tag !== expected.tag || card.reviewCommit !== expected.commit || card.reviewTag !== expected.tag ||
        ['accepted', 'focusedTestsPassed', 'browserObserved', 'remoteVerified'].some((key) => card[key] !== true)) fail('INDEPENDENT_ACCEPTANCE');
  }
  return freeze(gates);
}
function extract(html, id) {
  const matches = [...html.matchAll(new RegExp(`<pre id="${id}"(?: [^>]*)?>([\\s\\S]*?)<\\/pre>`, 'g'))];
  if (matches.length !== 1) fail('EXACT_SAVED_DOM');
  const text = matches[0][1].replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return require('..\\C034\\trace.js').parseJson(text);
}
function checkHistorical() {
  if (arguments.length) fail('NO_HISTORICAL_OVERRIDES');
  const imports = checkImports();
  const decoder = require('..\\C034\\trace.js');
  for (const [id, name] of [['closed-history', 'reset-history.html'], ['held-snapshot', 'between-reads.html']]) {
    const entry = pins.dependencies.find((pin) => pin.path ===
      path.join('capability', 'C033', 'evidence', 'raw', pins.historicalCapture, name));
    const html = readPinned(entry).toString('utf8');
    const snapshot = extract(html, 'state');
    if (decoder.canonical(snapshot.events) !== decoder.canonical(extract(html, 'events')) ||
        decoder.canonical(snapshot.history) !== decoder.canonical(extract(html, 'history')) ||
        decoder.canonical(snapshot) !== decoder.canonical(decoder.getSavedTrace(id).snapshot)) fail('EXACT_RAW_SOURCE_MISMATCH');
  }
  const entry = pins.dependencies.find((pin) => pin.path.endsWith(`${pins.historicalCapture}\\summary.json`));
  const summary = JSON.parse(readPinned(entry).toString('utf8'));
  if (summary.cardId !== 'C033' || summary.outcome !== 'passed' ||
      summary.actualSignedEdge.authenticodeStatus !== 'Valid' || summary.browserVersion !== '156.0.4314.50' ||
      summary.playwrightVersion !== '1.56.1' || summary.helperRawSha256 !== pins.browserHelperRawSha256 ||
      !Object.values(summary.cleanup).every((value) => value === true) ||
      decoder.canonical(summary.checks[8].observed) !== decoder.canonical(decoder.getSavedTrace('closed-history').replacementSummary)) fail('EXACT_RAW_REPORT_MISMATCH');
  return freeze({ imports, source: 'exact unchanged accepted raw C033 DOM and summary; no new live journey' });
}
module.exports = Object.freeze({ pins, hash, normalize, readFile, readPinned, checkImports, readGates, checkHistorical });
