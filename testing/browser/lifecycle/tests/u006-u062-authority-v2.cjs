'use strict';

const first = require('./u006-u062-authority.cjs');
const { createHash } = require('node:crypto');
const EPOCH = 'evidence\\u062\\source-epoch-1.json';
const EPOCH_SHA = '50273f1276ae1b1c783e76e215d0498e149f5409a2b9125b3011991e9ace1f83';
const FIRST_HEAD_SHA = '9d0b18a1f8372a9002e740bdb71e1e82bbec457797c8efcf3d44361e5b5d0029';
const HEAD = 'evidence\\u062\\authority-head-2.json';
const ADDENDUM = 'evidence\\u062\\authority-addendum-2.json';
const FRESH = Object.freeze([...first.FRESH, 'tests\\u006-u062-authority-v2.cjs', 'tests\\u006-u062-evidence-v2.cjs']);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const closed = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...fields].sort().join('\0');
const digestSet = (value) => closed(value, ['rawSha256', 'lfSha256', 'crlfSha256']) && Object.values(value).every((item) => typeof item === 'string' && /^[0-9a-f]{64}$/.test(item));
const same = (left, right) => digestSet(left) && digestSet(right) && Object.keys(left).every((key) => left[key] === right[key]);
const matches = (bytes, digests) => Buffer.isBuffer(bytes) && digestSet(digests) && Object.values(digests).includes(hash(bytes));
const refuse = (code, message) => { throw Object.assign(new Error(`${code}: ${message}`), { code }); };

function loadAuthority(read, readImport) {
  const bytesOf = (file) => {
    let bytes;
    try { bytes = read(file); } catch { refuse('U062_SOURCE_MISSING', file); }
    if (!Buffer.isBuffer(bytes) || bytes.length > 2 * 1024 * 1024) refuse('U062_SOURCE_BYTES', file);
    return bytes;
  };
  const parse = (file) => {
    try { return JSON.parse(bytesOf(file).toString('utf8')); } catch (error) {
      if (error.code && error.code.startsWith('U062_')) throw error;
      refuse('U062_JSON', file);
    }
  };
  if (hash(bytesOf(EPOCH)) !== EPOCH_SHA) refuse('U062_EPOCH_CHANGED', EPOCH);
  const epoch = parse(EPOCH);
  const expected = [...first.AMENDABLE, ...first.FRESH, 'tests\\u006-u062-authority.test.cjs'];
  if (!closed(epoch, ['schema', 'head', 'addendum', 'files']) || epoch.schema !== 'U062-source-epoch/1'
    || epoch.files.length !== expected.length || epoch.head.path !== first.HEAD || epoch.head.rawSha256 !== FIRST_HEAD_SHA
    || hash(bytesOf(first.HEAD)) !== FIRST_HEAD_SHA || hash(bytesOf(first.ADDENDUM)) !== epoch.addendum.rawSha256) {
    refuse('U062_EPOCH_CHANGED', EPOCH);
  }
  const predecessor = new Map();
  for (const entry of epoch.files) {
    if (!closed(entry, ['path', 'retained', 'digests']) || !expected.includes(entry.path) || predecessor.has(entry.path)
      || !same(first.triples(bytesOf(entry.retained)), entry.digests)) refuse('U062_EPOCH_SOURCE_CHANGED', entry.path);
    predecessor.set(entry.path, { retained: entry.retained, digests: Object.freeze({ ...entry.digests }) });
  }
  const historicalRead = (file) => predecessor.has(file) ? bytesOf(predecessor.get(file).retained) : bytesOf(file);
  const historical = first.loadAuthority(historicalRead, readImport);
  const head = parse(HEAD);
  if (!closed(head, ['schema', 'cardId', 'sequence', 'baseSha256', 'previousHeadSha256', 'sourceEpochSha256', 'addendumPath', 'addendumSha256'])
    || head.schema !== 'U062-tooling-head/2' || head.cardId !== 'U062' || head.sequence !== 2
    || head.baseSha256 !== historical.baseSha256 || head.previousHeadSha256 !== FIRST_HEAD_SHA || head.sourceEpochSha256 !== EPOCH_SHA
    || head.addendumPath !== ADDENDUM || hash(bytesOf(ADDENDUM)) !== head.addendumSha256) refuse('U062_HEAD_CHANGED', HEAD);
  const value = parse(ADDENDUM);
  if (!closed(value, ['schema', 'cardId', 'sequence', 'base', 'previous', 'amendments', 'freshFiles'])
    || value.schema !== 'U062-tooling-addendum/2' || value.cardId !== 'U062' || value.sequence !== 2
    || !closed(value.base, ['path', 'rawSha256']) || value.base.path !== first.BASE || value.base.rawSha256 !== historical.baseSha256
    || !closed(value.previous, ['headPath', 'headSha256', 'addendumPath', 'addendumSha256', 'sourceEpochPath', 'sourceEpochSha256'])
    || value.previous.headPath !== first.HEAD || value.previous.headSha256 !== FIRST_HEAD_SHA
    || value.previous.addendumPath !== first.ADDENDUM || value.previous.addendumSha256 !== epoch.addendum.rawSha256
    || value.previous.sourceEpochPath !== EPOCH || value.previous.sourceEpochSha256 !== EPOCH_SHA
    || !Array.isArray(value.amendments) || value.amendments.length !== first.AMENDABLE.length
    || !Array.isArray(value.freshFiles) || value.freshFiles.length !== FRESH.length) refuse('U062_ADDENDUM_SHAPE', ADDENDUM);
  const current = new Map();
  for (const step of value.amendments) {
    if (!closed(step, ['path', 'previous', 'current']) || !first.AMENDABLE.includes(step.path) || current.has(step.path)
      || !same(step.previous, predecessor.get(step.path)?.digests) || !digestSet(step.current)) refuse('U062_AMENDMENT_CHANGED', step.path);
    if (!matches(bytesOf(step.path), step.current)) refuse('U062_CURRENT_CHANGED', step.path);
    current.set(step.path, Object.freeze({ ...step.current }));
  }
  const fresh = new Set();
  for (const entry of value.freshFiles) {
    const previous = predecessor.get(entry.path);
    if (!closed(entry, ['path', 'previous', 'current']) || !FRESH.includes(entry.path) || fresh.has(entry.path)
      || (previous ? !same(entry.previous, previous.digests) : entry.previous !== null)
      || !matches(bytesOf(entry.path), entry.current)) refuse('U062_FRESH_CHANGED', entry.path);
    fresh.add(entry.path);
  }
  return Object.freeze({
    baseSha256: historical.baseSha256,
    headSha256: hash(bytesOf(HEAD)),
    previousHeadSha256: FIRST_HEAD_SHA,
    readonlyPins: () => historical.readonlyPins(),
    canAmend(manifestBytes, input, actual) {
      const prefix = 'testing\\browser\\lifecycle\\';
      if (!input.path.startsWith(prefix)) return false;
      const file = input.path.slice(prefix.length);
      if (!first.AMENDABLE.includes(file)) return false;
      return historical.canAmend(manifestBytes, input, historicalRead(file)) && matches(actual, current.get(file));
    },
  });
}

module.exports = { loadAuthority, BASE: first.BASE, HEAD, ADDENDUM, AMENDABLE: first.AMENDABLE, FRESH, EPOCH, triples: first.triples };
