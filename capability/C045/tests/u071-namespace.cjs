'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const CARD = 'C045';
const ITEM = 'U071';
const BASE_SHA = '038eb43fb0a2e8106b59a5476eb6c0b0f4bc945d32121f424148efc7c8334a14';
const own = path.resolve(__dirname, '..');
const baseName = `evidence\\${ITEM.toLowerCase()}\\namespace-base.json`;
const headName = `evidence\\${ITEM.toLowerCase()}\\current-authority-1.json`;
const anchorName = `tests\\${ITEM.toLowerCase()}-current.test.cjs`;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = bytes => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const sourceForm = name => CARD === 'C045' && !name.startsWith('evidence\\') &&
  /\.(?:cjs|js|ps1|html|css|md|feature)$/.test(name);
const failure = (code, name) => { throw Object.assign(new Error(`${code} ${name}`), { code }); };
function confined(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_.-]+(?:\\[A-Za-z0-9_.-]+)*$/.test(name) ||
      name.split('\\').some(part => part === '.' || part === '..')) failure('CURRENT_PATH', String(name));
  return name;
}
function read(name) {
  const file = path.join(own, ...confined(name).split('\\'));
  const actual = fs.realpathSync(file);
  const stat = fs.lstatSync(file);
  if (actual !== file || !stat.isFile() || stat.nlink !== 1) failure('CURRENT_REGULAR_FILE', name);
  return fs.readFileSync(file);
}
function enumerate(directory = own, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = prefix ? `${prefix}\\${entry.name}` : entry.name;
    const file = path.join(directory, entry.name);
    if (fs.realpathSync(file) !== file || fs.lstatSync(file).isSymbolicLink()) failure('CURRENT_REGULAR_FILE', name);
    return entry.isDirectory() ? enumerate(file, name) : [name];
  }).sort();
}
function metadata() {
  const bytes = read(baseName);
  if (sha(bytes) !== BASE_SHA) failure('BASELINE_CHANGED', baseName);
  const base = JSON.parse(bytes);
  const headBytes = read(headName);
  const head = JSON.parse(headBytes);
  if (head.schema !== 'exact-current-namespace-authority/1' || head.cardId !== CARD ||
      head.item !== ITEM || head.baseSha256 !== BASE_SHA || head.previous !== null) failure('CURRENT_AUTHORITY_SHAPE', headName);
  return { base, head, headBytes };
}
function records(base, head) {
  const expected = new Map(base.files.map(row => [row.path, { ...row }]));
  const seen = new Set();
  for (const step of head.replacements) {
    confined(step.path);
    if (seen.has(step.path) || !expected.has(step.path)) failure('CURRENT_REPLACEMENT_SET', step.path);
    seen.add(step.path);
    if (CARD === 'C059' && !step.path.startsWith('tests\\')) failure('C059_PRODUCTION_CHANGE_FORBIDDEN', step.path);
    if (CARD === 'C045' && !step.path.startsWith('tests\\') &&
        step.path !== 'source-integrity.cjs') failure('C045_REPLACEMENT_SCOPE', step.path);
    const before = expected.get(step.path);
    if (step.previousRawSha256 !== before.rawSha256 || step.rawSha256 === before.rawSha256) failure('CURRENT_PREDECESSOR', step.path);
    const witness = read(step.beforeWitness);
    if (sha(witness) !== before.rawSha256) failure('CURRENT_PREDECESSOR_WITNESS', step.path);
    expected.set(step.path, { path: step.path, rawSha256: step.rawSha256,
      crlfToLfSha256: step.crlfToLfSha256, acceptLf: sourceForm(step.path) });
  }
  for (const row of head.additions) {
    confined(row.path);
    if (expected.has(row.path) || row.path === headName || row.path === anchorName) failure('CURRENT_ADDITION_SET', row.path);
    expected.set(row.path, row);
  }
  return expected;
}
function check(expected, names, reader) {
  const remaining = new Set(expected.keys());
  for (const name of names) {
    if (name === headName || name === anchorName) continue;
    if (!remaining.delete(name)) failure('CURRENT_UNINDEXED_FILE', name);
    const row = expected.get(name);
    const bytes = reader(name);
    const digest = sha(bytes);
    if (digest !== row.rawSha256 && digest !== row.acceptedGitSha256 &&
        !(row.acceptLf && sha(lf(bytes)) === row.crlfToLfSha256)) failure('CURRENT_BYTES_CHANGED', name);
  }
  if (remaining.size) failure('CURRENT_FILE_MISSING', [...remaining][0]);
}
function verifyCurrent(expectedHeadSha256) {
  const { base, head, headBytes } = metadata();
  checkHead(headBytes, expectedHeadSha256);
  const expected = records(base, head);
  const actualNames = enumerate();
  check(expected, actualNames, read);
  return Object.freeze({ kind: 'actual-current-filesystem-enumeration', cardId: CARD,
    files: actualNames.length, sourceFiles: actualNames.filter(name => !name.startsWith('evidence\\')).length,
    headSha256: sha(headBytes), actualNames: Object.freeze(actualNames) });
}
function checkHead(bytes, expected) {
  if (expected && sha(bytes) !== expected) failure('CURRENT_HEAD_CHANGED', headName);
}
module.exports = Object.freeze({ sha, lf, sourceForm, read, enumerate, metadata, records, check, checkHead, verifyCurrent });
