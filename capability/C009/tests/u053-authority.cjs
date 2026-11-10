'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const PREFIX = 'capability\\C009\\';
const BASE = Object.freeze({
  path: `${PREFIX}evidence\\green-fix2\\suite.json`,
  rawSha256: '51478d4c4cc3724a20b34fce617cbeb03d02b1ce808e5faeb6142a3b8102cc6f'
});
const PRODUCTION = Object.freeze(['authz.cjs', 'cli.cjs', 'codes.cjs', 'commands.cjs', 'contract.js', 'handlers.cjs', 'http-io.cjs', 'ledger.cjs', 'page.js', 'queue.cjs', 'server.cjs']);
const NAME = /^u053-cleanbase-addendum-([1-9][0-9]*)\.json$/;
const SHA = /^[0-9a-f]{64}$/;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const same = (bytes, pin, canonical = true) => sha(bytes) === pin.rawSha256 || (canonical && sha(lf(bytes)) === pin.crlfToLfSha256);
const parsedSha = (value) => sha(Buffer.from(JSON.stringify(value)));
const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...keys].sort().join();

function fail(code, detail = '') {
  throw Object.assign(new Error(`${code}${detail ? `: ${detail}` : ''}`), { code });
}

function owned(file) {
  if (typeof file !== 'string' || !file.startsWith(PREFIX) || /[/:\u0000]/.test(file) || file.split('\\').some((part) =>
    !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..' || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    fail('AUTHORITY_PATH', String(file));
  }
  return file;
}

function pin(value) {
  if (!closed(value, ['path', 'bytes', 'rawSha256', 'crlfToLfSha256']) || !Number.isSafeInteger(value.bytes) || value.bytes < 0 ||
      !SHA.test(value.rawSha256) || !SHA.test(value.crlfToLfSha256)) fail('AUTHORITY_PIN_SHAPE');
  owned(value.path);
  return value;
}

function readOwn(repository, relative) {
  owned(relative);
  const file = path.resolve(repository, relative);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.nlink !== 1 || fs.realpathSync(file).toLowerCase() !== file.toLowerCase()) fail('AUTHORITY_FILE', relative);
  return fs.readFileSync(file);
}

function listAddenda(root) {
  return fs.readdirSync(root).filter((name) => name.startsWith('u053-cleanbase-addendum-')).map((name) => {
    const match = NAME.exec(name);
    if (!match) fail('ADDENDUM_NAME', name);
    const file = path.join(root, name);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.nlink !== 1 || fs.realpathSync(file).toLowerCase() !== file.toLowerCase()) fail('ADDENDUM_FILE', name);
    return { name, bytes: fs.readFileSync(file), sequence: Number(match[1]) };
  }).sort((left, right) => left.sequence - right.sequence);
}

function resolveChain({ addenda, read, expectedTip = null }) {
  if (!Array.isArray(addenda) || typeof read !== 'function' || addenda.length > 64) fail('ADDENDUM_SHAPE');
  if (!addenda.length) fail('ADDENDUM_MISSING', 'the accepted history requires the U053 amendment');
  if (sha(read(BASE.path)) !== BASE.rawSha256) fail('ADDENDUM_BASE_BYTES', BASE.path);
  let previous = null;
  let catalogPin = null;
  let catalog = null;
  const current = new Map();
  const history = new Map();
  const additions = new Map();
  const subjects = new Map();
  const subjectKeys = new Map();
  for (let index = 0; index < addenda.length; index += 1) {
    const entry = addenda[index];
    if (!entry || typeof entry.name !== 'string' || !Buffer.isBuffer(entry.bytes) || entry.bytes.length > 4 * 1024 * 1024) fail('ADDENDUM_SHAPE');
    let value;
    try { value = JSON.parse(entry.bytes.toString('utf8')); } catch { fail('ADDENDUM_JSON', entry.name); }
    if (!closed(value, ['schema', 'cardId', 'sequence', 'item', 'reason', 'base', 'previous', 'catalog', 'amendments', 'additions', 'subjects'])) fail('ADDENDUM_SHAPE', entry.name);
    if (entry.name !== `u053-cleanbase-addendum-${index + 1}.json` || value.sequence !== index + 1) fail('ADDENDUM_SEQUENCE', entry.name);
    if (value.schema !== 'C009-cleanbase-evidence-addendum/1' || value.cardId !== 'C009' || value.item !== 'U053' ||
        typeof value.reason !== 'string' || !value.reason.trim()) fail('ADDENDUM_SCHEMA', entry.name);
    if (!closed(value.base, ['path', 'rawSha256']) || value.base.path !== BASE.path || value.base.rawSha256 !== BASE.rawSha256) fail('ADDENDUM_BASE', entry.name);
    const linked = previous === null ? value.previous === null : closed(value.previous, ['path', 'rawSha256', 'crlfToLfSha256']) &&
      SHA.test(value.previous.rawSha256) && SHA.test(value.previous.crlfToLfSha256) && value.previous.path === previous.path &&
      (value.previous.rawSha256 === previous.rawSha256 || value.previous.crlfToLfSha256 === previous.crlfToLfSha256);
    if (!linked) fail('ADDENDUM_CHAIN', entry.name);
    if (!Array.isArray(value.amendments) || !Array.isArray(value.additions) || !Array.isArray(value.subjects) ||
        value.amendments.length + value.additions.length + value.subjects.length === 0) fail('ADDENDUM_SHAPE', entry.name);
    pin(value.catalog);
    if (value.catalog.path !== `${PREFIX}evidence\\u053-cleanbase\\catalog.json`) fail('ADDENDUM_CATALOG_PATH', entry.name);
    if (catalogPin !== null && JSON.stringify(catalogPin) !== JSON.stringify(value.catalog)) fail('ADDENDUM_CATALOG_CHANGED', entry.name);
    if (catalog === null) {
      const bytes = read(value.catalog.path);
      if (!same(bytes, value.catalog, false) || bytes.length !== value.catalog.bytes) fail('ADDENDUM_CATALOG_BYTES');
      catalogPin = value.catalog;
      catalog = JSON.parse(bytes.toString('utf8'));
      if (!closed(catalog, ['schema', 'files', 'production']) || catalog.schema !== 'C009-history-catalog/1' ||
          !Array.isArray(catalog.files) || !Array.isArray(catalog.production)) fail('ADDENDUM_CATALOG_SHAPE');
      for (const original of catalog.files) {
        pin(original);
        if (current.has(original.path)) fail('CATALOG_DUPLICATE', original.path);
        current.set(original.path, original);
        history.set(original.path, [original]);
      }
      if (catalog.production.length !== PRODUCTION.length || catalog.production.some((item, number) =>
        item.path !== `${PREFIX}${PRODUCTION[number]}` || item.acceptedCommit !== 'f95cc52a29cf' || !SHA.test(item.gitCanonicalSha256) ||
        !SHA.test(item.currentRawSha256) || item.currentRawSha256 !== current.get(item.path)?.rawSha256 ||
        item.gitCanonicalSha256 !== current.get(item.path)?.crlfToLfSha256)) fail('PRODUCTION_CATALOG');
    }
    const seen = new Set();
    for (const step of value.amendments) {
      if (!closed(step, ['path', 'previous', 'current', 'retained', 'reason']) || typeof step.reason !== 'string' || !step.reason.trim()) fail('AMENDMENT_SHAPE');
      owned(step.path);
      if (!(step.path === `${PREFIX}README.md` || step.path === `${PREFIX}U053.md` ||
          /^capability\\C009\\tests\\[A-Za-z0-9_.-]+\.cjs$/.test(step.path))) fail('AMENDMENT_PATH_NOT_ALLOWED', step.path);
      if (seen.has(step.path)) fail('AMENDMENT_DUPLICATE', step.path);
      seen.add(step.path);
      pin(step.previous); pin(step.current); pin(step.retained);
      const prior = current.get(step.path);
      if (!prior || step.previous.path !== step.path || JSON.stringify(prior) !== JSON.stringify(step.previous)) fail('AMENDMENT_PREVIOUS_MISMATCH', step.path);
      if (step.current.path !== step.path || step.current.rawSha256 === prior.rawSha256) fail('AMENDMENT_NOOP_OR_PATH', step.path);
      if (!step.retained.path.startsWith(`${PREFIX}evidence\\u053-cleanbase\\`) || step.retained.rawSha256 !== prior.rawSha256 ||
          step.retained.crlfToLfSha256 !== prior.crlfToLfSha256 || step.retained.bytes !== prior.bytes ||
          !same(read(step.retained.path), step.retained, false)) fail('AMENDMENT_RETAINED_BYTES', step.path);
      current.set(step.path, step.current);
      history.set(step.path, [...history.get(step.path), step.current]);
    }
    for (const addition of value.additions) {
      pin(addition);
      if (!addition.path.startsWith(`${PREFIX}evidence\\u053-cleanbase\\`) &&
          !/^capability\\C009\\(?:tests\\u053-[A-Za-z0-9_.-]+\.cjs|tests\\u053\.test\.cjs|tests\\(?:fix3-evidence|pipeline-node-own|pipeline-refusal-http10|pipeline-refusal-mixed|readme-contract)\.test\.cjs|tests\\(?:flood-attacks|flood-servers|load-loop|pipeline-matrix)\.cjs|U053\.(?:md|feature))$/.test(addition.path)) fail('ADDITION_PATH_NOT_ALLOWED', addition.path);
      if (current.has(addition.path) || additions.has(addition.path)) fail('ADDITION_DUPLICATE_OR_SEALED', addition.path);
      additions.set(addition.path, addition);
      current.set(addition.path, addition);
      history.set(addition.path, [addition]);
    }
    for (const subject of value.subjects) {
      if (!closed(subject, ['manifest', 'parsedSha256', 'inputs']) || !SHA.test(subject.parsedSha256) || !Array.isArray(subject.inputs) || !subject.inputs.length) fail('SUBJECT_SHAPE');
      pin(subject.manifest);
      if (subjects.has(subject.manifest.path) || subjectKeys.has(subject.parsedSha256)) fail('SUBJECT_DUPLICATE', subject.manifest.path);
      const original = current.get(subject.manifest.path);
      if (!original || JSON.stringify(original) !== JSON.stringify(subject.manifest)) fail('SUBJECT_MANIFEST_NOT_SEALED', subject.manifest.path);
      const paths = new Set();
      for (const input of subject.inputs) {
        if (!closed(input, ['path', 'pristinePath', 'bytes', 'rawSha256', 'crlfToLfSha256'])) fail('SUBJECT_INPUT_SHAPE');
        owned(input.path); owned(input.pristinePath);
        if (paths.has(input.path)) fail('SUBJECT_INPUT_DUPLICATE', input.path);
        paths.add(input.path);
        pin({ path: input.pristinePath, bytes: input.bytes, rawSha256: input.rawSha256, crlfToLfSha256: input.crlfToLfSha256 });
        if (!input.pristinePath.startsWith(`${PREFIX}evidence\\`)) fail('SUBJECT_NOT_PRISTINE', input.path);
      }
      subjects.set(subject.manifest.path, subject);
      subjectKeys.set(subject.parsedSha256, subject);
    }
    previous = { path: `${PREFIX}${entry.name}`, rawSha256: sha(entry.bytes), crlfToLfSha256: sha(lf(entry.bytes)) };
  }
  if (expectedTip && (expectedTip.path !== previous.path ||
    (expectedTip.rawSha256 !== previous.rawSha256 && expectedTip.crlfToLfSha256 !== previous.crlfToLfSha256))) fail('ADDENDUM_APPROVED_TIP', previous.path);
  return { count: addenda.length, tip: previous, catalog, catalogPin, current, history, additions, subjects, subjectKeys };
}

function checkSubjects({ chain, read }) {
  let count = 0;
  for (const subject of chain.subjects.values()) {
    const bytes = read(subject.manifest.path);
    if (!same(bytes, subject.manifest, false)) fail('SUBJECT_MANIFEST_CHANGED', subject.manifest.path);
    const manifest = JSON.parse(bytes.toString('utf8'));
    if (parsedSha(manifest) !== subject.parsedSha256 || !Array.isArray(manifest.inputs) || manifest.inputs.length !== subject.inputs.length) fail('SUBJECT_INPUT_SET', subject.manifest.path);
    for (const original of manifest.inputs) {
      const input = subject.inputs.find((entry) => entry.path === original.path);
      if (!input || input.rawSha256 !== original.rawSha256 || input.crlfToLfSha256 !== original.crlfToLfSha256 || input.bytes !== original.bytes) fail('SUBJECT_INPUT_PIN', original.path);
      const pristine = read(input.pristinePath);
      if (pristine.length !== input.bytes || !same(pristine, input, false) || sha(lf(pristine)) !== input.crlfToLfSha256) fail('SUBJECT_BYTES_CHANGED', input.path);
      count += 1;
    }
  }
  return count;
}

function checkCurrent({ chain, read }) {
  for (const entry of chain.current.values()) {
    const evidence = entry.path.startsWith(`${PREFIX}evidence\\`);
    const bytes = read(entry.path);
    if (!same(bytes, entry, !evidence) || (evidence && bytes.length !== entry.bytes)) fail('CURRENT_BYTES_CHANGED', entry.path);
  }
  checkSubjects({ chain, read });
  return chain.current.size;
}

function inputProblems({ chain, manifest, read, pinned = () => true }) {
  const problems = [];
  const subject = chain.subjectKeys.get(parsedSha(manifest));
  for (const input of manifest.inputs || []) {
    if (!pinned(input)) continue;
    const relative = input.path.replaceAll('/', '\\');
    const pristine = subject?.inputs.find((entry) => entry.path === relative);
    const head = chain.current.get(relative);
    const known = (chain.history.get(relative) || []).some((entry) => entry.rawSha256 === input.rawSha256 || entry.crlfToLfSha256 === input.crlfToLfSha256);
    let bytes;
    let error;
    try { bytes = read(input.path); } catch (caught) { error = caught; }
    if (bytes === undefined ? !(pristine && !head) :
      !same(bytes, input) && !(head && (known || pristine) && same(bytes, head, !relative.startsWith(`${PREFIX}evidence\\`)))) {
      problems.push(`${input.path}: ${error ? error.message : 'differs from the bytes the run saw'}`);
    }
    if (pristine) {
      try {
        const retained = read(pristine.pristinePath);
        if (!same(retained, pristine, false) || retained.length !== pristine.bytes) problems.push(`${input.path}: pristine subject bytes differ from the bytes the run saw`);
      } catch (caught) { problems.push(`${input.path}: ${caught.message}`); }
    }
  }
  return problems;
}

function readCurrentAuthority(root = path.resolve(__dirname, '..')) {
  const repository = path.resolve(root, '..', '..');
  return resolveChain({ addenda: listAddenda(root), read: (file) => readOwn(repository, file) });
}

function historicalTestFiles(chain) {
  return chain.catalog.files.filter((entry) => /^capability\\C009\\tests\\[^\\]+\.test\.cjs$/.test(entry.path)).map((entry) => entry.path).sort();
}

function currentTestFiles(chain) {
  return [...chain.current.keys()].filter((file) => /^capability\\C009\\tests\\[^\\]+\.test\.cjs$/.test(file)).sort();
}

module.exports = Object.freeze({ BASE, PREFIX, PRODUCTION, sha, lf, same, parsedSha, owned, pin, readOwn, listAddenda, resolveChain,
  checkSubjects, checkCurrent, inputProblems, readCurrentAuthority, historicalTestFiles, currentTestFiles });
