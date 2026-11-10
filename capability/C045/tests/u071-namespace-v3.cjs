'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const CARD = 'C045', ITEM = 'U071', BASE_SHA = '038eb43fb0a2e8106b59a5476eb6c0b0f4bc945d32121f424148efc7c8334a14', PRIOR_SHA = '4ab6e4148a147c2d39cdf6b2c44cb6a0c8b22bd2821d744bca65c80fce50c279';
const own = path.resolve(__dirname, '..');
const baseName = `evidence\\${ITEM.toLowerCase()}\\namespace-base.json`;
const priorName = `evidence\\${ITEM.toLowerCase()}\\current-authority-1.json`;
const headName = `evidence\\${ITEM.toLowerCase()}\\current-authority-3.json`;
const secondName = 'evidence\\u071\\current-authority-2.json';
const SECOND_SHA = '31ff3b52efec6841c8b8831a590100e966d113aa796837ec18118aad928c2d5d';
const anchorName = `tests\\${ITEM.toLowerCase()}-current.test.cjs`;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = bytes => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const sourceForm = name => CARD === 'C045' && !name.startsWith('evidence\\') && /\.(?:cjs|js|ps1|html|css|md|feature)$/.test(name);
const failure = (code, name) => { throw Object.assign(new Error(`${code} ${name}`), { code }); };
function confined(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_.-]+(?:\\[A-Za-z0-9_.-]+)*$/.test(name) ||
      name.split('\\').some(part => part === '.' || part === '..')) failure('CURRENT_PATH', String(name));
  return name;
}
function read(name) {
  const file = path.join(own, ...confined(name).split('\\'));
  const stat = fs.lstatSync(file);
  if (fs.realpathSync(file) !== file || !stat.isFile() || stat.nlink !== 1) failure('CURRENT_REGULAR_FILE', name);
  return fs.readFileSync(file);
}
function enumerate(directory = own, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = prefix ? `${prefix}\\${entry.name}` : entry.name, file = path.join(directory, entry.name);
    if (fs.realpathSync(file) !== file || fs.lstatSync(file).isSymbolicLink()) failure('CURRENT_REGULAR_FILE', name);
    return entry.isDirectory() ? enumerate(file, name) : [name];
  }).sort();
}
function metadata() {
  const raw = read(baseName), priorBytes = read(priorName), headBytes = read(headName);
  if (sha(raw) !== BASE_SHA) failure('BASELINE_CHANGED', baseName);
  if (sha(priorBytes) !== PRIOR_SHA) failure('PRIOR_HEAD_CHANGED', priorName);
  const base = JSON.parse(raw), previous = JSON.parse(priorBytes), head = JSON.parse(headBytes);
  if (head.schema !== 'exact-current-namespace-authority/3' || head.cardId !== CARD || head.item !== ITEM ||
      head.baseSha256 !== BASE_SHA || head.previous?.path !== secondName || head.previous.rawSha256 !== SECOND_SHA) failure('CURRENT_AUTHORITY_SHAPE', headName);
  return { base, head, headBytes, previous };
}
function records(base, head) {
  const priorBytes = read(priorName);
  if (sha(priorBytes) !== PRIOR_SHA) failure('PRIOR_HEAD_CHANGED', priorName);
  const secondBytes = read(secondName);
  if (sha(secondBytes) !== SECOND_SHA) failure('SECOND_HEAD_CHANGED', secondName);
  const plans = [JSON.parse(priorBytes), JSON.parse(secondBytes), head];
  const expected = new Map(base.files.map(row => [row.path, { ...row }]));
  for (const plan of plans) {
    const seen = new Set();
    for (const step of plan.replacements) {
      confined(step.path);
      if (seen.has(step.path) || !expected.has(step.path)) failure('CURRENT_REPLACEMENT_SET', step.path);
      seen.add(step.path);
      if (CARD === 'C059' && !step.path.startsWith('tests\\')) failure('C059_PRODUCTION_CHANGE_FORBIDDEN', step.path);
      if (CARD === 'C045' && !step.path.startsWith('tests\\') && step.path !== 'source-integrity.cjs' &&
          !(step.path === 'consent.ps1' && step.previousRawSha256 === '188fc4b21f7c4849d55cffe38c971229fb49869ad72cf05c8e761bbca12dbf4a' &&
            step.rawSha256 === 'a4e755000b41564fe20c231ea90889a5a1c384bdfc11730f91a3163c9b566d98' && step.crlfToLfSha256 === 'cdda8603d3f9c70017ec588f8b46eb4d97e51f616cf308870b5af5a9b3b1f624')) failure('C045_REPLACEMENT_SCOPE', step.path);
      const before = expected.get(step.path);
      if (step.previousRawSha256 !== before.rawSha256 || step.rawSha256 === before.rawSha256) failure('CURRENT_PREDECESSOR', step.path);
      if (sha(read(step.beforeWitness)) !== before.rawSha256) failure('CURRENT_PREDECESSOR_WITNESS', step.path);
      expected.set(step.path, { path: step.path, rawSha256: step.rawSha256, crlfToLfSha256: step.crlfToLfSha256, acceptLf: sourceForm(step.path) });
    }
    for (const row of plan.additions) {
      confined(row.path);
      if (expected.has(row.path) || row.path === headName || row.path === anchorName) failure('CURRENT_ADDITION_SET', row.path);
      expected.set(row.path, row);
    }
  }
  expected.set(priorName, { path: priorName, rawSha256: PRIOR_SHA, acceptLf: false });
  expected.set(secondName, { path: secondName, rawSha256: SECOND_SHA, acceptLf: false });
  return expected;
}
function check(expected, names, reader) {
  const remaining = new Set(expected.keys());
  for (const name of names) {
    if (name === headName || name === anchorName) continue;
    if (!remaining.delete(name)) failure('CURRENT_UNINDEXED_FILE', name);
    const row = expected.get(name), bytes = reader(name), digest = sha(bytes);
    if (digest !== row.rawSha256 && digest !== row.acceptedGitSha256 &&
        !(row.acceptLf && sha(lf(bytes)) === row.crlfToLfSha256)) failure('CURRENT_BYTES_CHANGED', name);
  }
  if (remaining.size) failure('CURRENT_FILE_MISSING', [...remaining][0]);
}
function checkHead(bytes, expected) {
  if (expected && sha(bytes) !== expected) failure('CURRENT_HEAD_CHANGED', headName);
}
function verifyCurrent(expectedHeadSha256) {
  const { base, head, headBytes } = metadata();
  checkHead(headBytes, expectedHeadSha256);
  const actualNames = enumerate();
  check(records(base, head), actualNames, read);
  return Object.freeze({ kind: 'actual-current-filesystem-enumeration', cardId: CARD,
    files: actualNames.length, sourceFiles: actualNames.filter(name => !name.startsWith('evidence\\')).length,
    headSha256: sha(headBytes), actualNames: Object.freeze(actualNames) });
}
module.exports = Object.freeze({ sha, lf, sourceForm, read, enumerate, metadata, records, check, checkHead, verifyCurrent });
