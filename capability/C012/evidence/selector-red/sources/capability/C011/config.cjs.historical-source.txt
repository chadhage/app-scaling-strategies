'use strict';

// The closed server-side configuration of C011: the pool, the caps of each lease, the price table, the reservation lifetime and the limits of the
// server. Every number is a plain safe integer inside the bounds of the table below, a name outside the table is refused, and nothing can be
// supplied by a client: this is read once at start (a single snapshot, so a getter or a Proxy cannot answer twice) and refused BEFORE anything
// is created. The error names only the path of the table that failed (a string of this file) and never echoes anything the caller supplied.
const base = require('../C009/contract.js');

const CONDUCTORS = Object.freeze(Object.values(base.identities).filter((identity) => identity.role === 'conductor').map((identity) => identity.subject));
const TIERS = Object.freeze(['standard', 'burst']);
const PRICE_VERSION = 'p1';
const DEFAULT_PRICES = Object.freeze({ standard: 4, burst: 8 });

// [path, default, minimum, maximum]
const NUMBERS = Object.freeze([
  ['pool.units', 100, 1, 1000], ['pool.spend', 600, 1, 100000],
  ...CONDUCTORS.flatMap((subject) => [[`caps.${subject}.units`, 60, 1, 1000], [`caps.${subject}.spend`, 400, 1, 100000]]),
  ...TIERS.map((tier) => [`prices.${tier}`, DEFAULT_PRICES[tier], 1, 1000]),
  ['ttlMs', 300000, 1000, 900000], ['maxActive', 20, 1, 100], ['entries', 50, 2, 200], ['keyEntries', 1000, 1, 2000],
  // The idle timeout is above the header timeout plus the check interval (cross-checked below), so that a stalled header or body is answered 408.
  ['limits.bodyBytes', 4096, 256, 16384], ['limits.headerMs', 5000, 1, 60000], ['limits.checkMs', 1000, 1, 10000], ['limits.idleMs', 8000, 3, 120000],
  ['limits.connections', 256, 1, 1024], ['limits.pipelined', 4, 1, 16], ['limits.auditEntries', 200, 1, 1000], ['limits.anonymousEntries', 50, 1, 500]
].map((row) => Object.freeze(row)));
const KNOWN = new Set(NUMBERS.map(([path]) => path));
// The sections that hold numbers: every proper prefix of a path of the table.
const SECTIONS = new Set(NUMBERS.flatMap(([path]) => path.split('.').slice(0, -1).map((name, at, parts) => parts.slice(0, at + 1).join('.'))));

const fail = (field) => {
  throw Object.assign(new RangeError('CONFIG_INVALID'), { code: 'CONFIG_INVALID', field });
};

// One read of every own enumerable property of the plain objects; anything that is not a plain object is kept as it was read (and refused later).
function snapshot(value, depth = 0) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || depth > 3) return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return fail(null);
  const copy = Object.create(null);
  for (const name of Object.keys(value)) copy[name] = snapshot(value[name], depth + 1);
  return copy;
}

const isCopy = (value) => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === null;
// Every node of the snapshot: a section (a plain object) or a leaf (anything else).
function* nodes(copy, prefix = '') {
  for (const [name, value] of Object.entries(copy)) {
    yield { path: `${prefix}${name}`, section: isCopy(value) };
    if (isCopy(value)) yield* nodes(value, `${prefix}${name}.`);
  }
}
const lookup = (copy, path) => path.split('.').reduce((node, name) => (isCopy(node) && Object.hasOwn(node, name) ? node[name] : undefined), copy);

function resolveConfig(given) {
  let copy;
  try { copy = given === undefined ? Object.create(null) : snapshot(given); }
  catch { return fail(null); }
  if (!isCopy(copy)) return fail(null);
  for (const { path, section } of nodes(copy)) if (!(section ? SECTIONS : KNOWN).has(path)) fail(null);
  const flat = {};
  for (const [path, fallback, min, max] of NUMBERS) {
    const supplied = lookup(copy, path);
    const value = supplied === undefined ? fallback : supplied;
    if (!Number.isSafeInteger(value) || value < min || value > max) fail(path);
    flat[path] = value;
  }
  for (const subject of CONDUCTORS) {
    if (flat[`caps.${subject}.units`] > flat['pool.units'] || flat[`caps.${subject}.spend`] > flat['pool.spend']) fail(`caps.${subject}`);
  }
  if (flat.entries <= flat.maxActive) fail('entries');
  if (flat['limits.idleMs'] <= flat['limits.headerMs'] + flat['limits.checkMs']) fail('limits.idleMs');
  const section = (prefix, names) => Object.freeze(Object.fromEntries(names.map((name) => [name, flat[`${prefix}.${name}`]])));
  return Object.freeze({
    pool: section('pool', ['units', 'spend']),
    caps: Object.freeze(Object.fromEntries(CONDUCTORS.map((subject) => [subject, section(`caps.${subject}`, ['units', 'spend'])]))),
    prices: section('prices', TIERS),
    ttlMs: flat.ttlMs, maxActive: flat.maxActive, entries: flat.entries, keyEntries: flat.keyEntries,
    limits: section('limits', ['bodyBytes', 'headerMs', 'checkMs', 'idleMs', 'connections', 'pipelined', 'auditEntries', 'anonymousEntries'])
  });
}

module.exports = Object.freeze({ CONDUCTORS, TIERS, PRICE_VERSION, NUMBERS, resolveConfig });
