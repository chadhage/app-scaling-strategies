'use strict';

// C011 contract: the closed route table, the role table (deny by default), the shapes of ids and keys, the body schemas, the query vocabulary and
// the fixed bounds. The configuration (pool, caps, prices, lifetime and the tunable limits) is config.cjs. Pure data and pure functions; nothing
// here touches a socket or the books. Identities, roles and the claim fields come from the accepted C009 fixture (imported read-only, pinned).
const base = require('../C009/contract.js');
const config = require('./config.cjs');

const FIXED = Object.freeze({ urlChars: 2048, batchOps: 5, pageDefault: 20, pageMax: 50, offsetMax: 1000, unitsMax: 50, depth: 6 });
const CLAIM_FIELDS = base.claimFields;
// Names a client must never set: they belong to the server (the pool, the caps, the prices, the books, the deadline, the id).
const SERVER_FIELDS = Object.freeze(['id', 'lease', 'leaseId', 'pool', 'cap', 'caps', 'price', 'prices', 'priceVersion', 'spend', 'state', 'revision', 'createdAtMs',
  'deadlineMs', 'expiresAtMs', 'ttlMs', 'free', 'reserved', 'held', 'keyEntries', 'replayKeys', 'maxReplayKeys', 'remainingReplayKeys']);
const ID = /^rsv-[0-9a-f]{8,32}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
const STATES = Object.freeze(['reserved', 'released', 'expired']);
const isId = (value) => typeof value === 'string' && ID.test(value);
const isKey = (value) => typeof value === 'string' && KEY.test(value);
const isTier = (value) => typeof value === 'string' && config.TIERS.includes(value);
const isInteger = (min, max) => (value) => Number.isInteger(value) && value >= min && value <= max;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const RESERVATION_PATH = /^\/v1\/reservations\/(?<id>rsv-[0-9a-f]{8,32})$/;
const RELEASE_PATH = /^\/v1\/reservations\/(?<id>rsv-[0-9a-f]{8,32})\/release$/;
const LIST_QUERY = Object.freeze(['limit', 'offset', 'state']);
const PAGE_QUERY = Object.freeze(['limit', 'offset']);
const entry = (name, method, path, extra = {}) => Object.freeze({ name, method, path, query: null, body: null, mutating: false, public: false, ...extra });
const ROUTES = Object.freeze([
  entry('asset.index', 'GET', /^\/$/, { public: true }), entry('asset.page', 'GET', /^\/page\.js$/, { public: true }),
  entry('asset.style', 'GET', /^\/style\.css$/, { public: true }), entry('scope', 'GET', /^\/scope\.json$/, { public: true }),
  entry('me', 'GET', /^\/v1\/me$/),
  entry('reservation.create', 'POST', /^\/v1\/reservations$/, { body: 'reserve', mutating: true }),
  entry('reservation.list', 'GET', /^\/v1\/reservations$/, { query: LIST_QUERY }),
  entry('reservation.read', 'GET', RESERVATION_PATH), entry('reservation.release', 'POST', RELEASE_PATH, { mutating: true }),
  entry('allowance', 'GET', /^\/v1\/allowance$/), entry('audit', 'GET', /^\/v1\/audit$/, { query: PAGE_QUERY }),
  entry('batch', 'POST', /^\/v1\/batch$/, { body: 'batch', mutating: true }),
  entry('operator.pool', 'GET', /^\/v1\/operator\/pool$/), entry('operator.audit', 'GET', /^\/v1\/operator\/audit$/, { query: PAGE_QUERY })
]);

// Deny by default: a route that is not listed here is 404 for everyone, a route without roles is 403 for everyone, and roles do not inherit.
const CONDUCTOR_ROUTES = ['reservation.create', 'reservation.list', 'reservation.read', 'reservation.release', 'allowance', 'audit', 'batch'];
const ROLE_TABLE = Object.freeze(Object.fromEntries([
  ['me', ['visitor', 'conductor', 'operator']], ...CONDUCTOR_ROUTES.map((name) => [name, ['conductor']]),
  ['operator.pool', ['operator']], ['operator.audit', ['operator']]
].map(([name, roles]) => [name, Object.freeze({ roles: Object.freeze(roles) })])));

// Every route whose path matches (a path can serve several methods) and the named parameters of that path; no route when none matches.
function resolve(pathname) {
  const routes = [];
  let params = {};
  for (const candidate of ROUTES) {
    const match = candidate.path.exec(pathname);
    if (match) {
      routes.push(candidate);
      params = { ...match.groups };
    }
  }
  return { routes, params };
}
const allowedMethods = (routes) => [...new Set(routes.map((candidate) => candidate.method))].sort().join(', ');

const QUERY_PARSERS = Object.freeze({
  limit: (text) => (/^[0-9]{1,2}$/.test(text) && Number(text) >= 1 && Number(text) <= FIXED.pageMax ? Number(text) : undefined),
  offset: (text) => (/^[0-9]{1,4}$/.test(text) && Number(text) <= FIXED.offsetMax ? Number(text) : undefined),
  state: (text) => (STATES.includes(text) ? text : undefined)
});
const REJECTED = Object.freeze({ ok: false, code: 'QUERY_REJECTED' });

// The query is a closed vocabulary per route: a name outside it (an owner, a lease, a pool, a method override), a repeated name or a value outside
// its bounds is refused, and nothing in it ever names a reservation or a lease.
function parseQuery(route, raw) {
  if (route.query === null) return raw === '' ? { ok: true, value: {} } : { ok: false, code: 'QUERY_NOT_ALLOWED' };
  const value = { limit: FIXED.pageDefault, offset: 0, state: null };
  const seen = new Set();
  for (const [key, text] of new URLSearchParams(raw)) {
    if (!route.query.includes(key) || seen.has(key)) return REJECTED;
    seen.add(key);
    const parsed = QUERY_PARSERS[key](text);
    if (parsed === undefined) return REJECTED;
    value[key] = parsed;
  }
  return { ok: true, value };
}

const failure = (code, field) => ({ ok: false, code, ...(field && { field }) });
const RESERVE_SCHEMA = Object.freeze({ key: isKey, tier: isTier, units: isInteger(1, FIXED.unitsMax) });

// Fields first (a claimed owner or role, a server-owned field, an unknown name), then the required values. Only names from closed lists are echoed.
function checkFields(allowed, body) {
  for (const field of Object.keys(body)) {
    if (allowed.includes(field)) continue;
    if (CLAIM_FIELDS.includes(field)) return failure('IDENTITY_CLAIM_REJECTED', field);
    return SERVER_FIELDS.includes(field) ? failure('SERVER_FIELD_REJECTED', field) : failure('INPUT_UNKNOWN_FIELD');
  }
  return null;
}

function validateReserve(body) {
  if (!isObject(body)) return failure('BODY_NOT_OBJECT');
  const refused = checkFields(Object.keys(RESERVE_SCHEMA), body);
  if (refused) return refused;
  const value = {};
  for (const field of Object.keys(RESERVE_SCHEMA)) {
    if (!Object.hasOwn(body, field)) return failure('INPUT_MISSING_FIELD', field);
    if (!RESERVE_SCHEMA[field](body[field])) return failure('INPUT_INVALID', field);
    value[field] = body[field];
  }
  return { ok: true, value };
}

const OP_FIELDS = Object.freeze({ reserve: ['op', 'key', 'tier', 'units'], release: ['op', 'id'] });

function validateOp(operation) {
  if (!isObject(operation)) return failure('INPUT_INVALID', 'ops');
  const verb = operation.op;
  if (typeof verb !== 'string' || !Object.hasOwn(OP_FIELDS, verb)) return failure('INPUT_INVALID', 'op');
  if (verb === 'release') {
    const refused = checkFields(OP_FIELDS.release, operation);
    if (refused) return refused;
    if (!Object.hasOwn(operation, 'id')) return failure('INPUT_MISSING_FIELD', 'id');
    return isId(operation.id) ? { ok: true, value: { op: 'release', id: operation.id } } : failure('INPUT_INVALID', 'id');
  }
  const { op, ...rest } = operation;
  const checked = validateReserve(rest);
  return checked.ok ? { ok: true, value: { op, ...checked.value } } : checked;
}

function validateBatch(body) {
  if (!isObject(body)) return failure('BODY_NOT_OBJECT');
  const refused = checkFields(['ops'], body);
  if (refused) return refused;
  if (!Object.hasOwn(body, 'ops')) return failure('INPUT_MISSING_FIELD', 'ops');
  if (!Array.isArray(body.ops) || body.ops.length < 1 || body.ops.length > FIXED.batchOps) return failure('INPUT_INVALID', 'ops');
  const ops = [];
  for (const operation of body.ops) {
    const checked = validateOp(operation);
    if (!checked.ok) return checked;
    ops.push(checked.value);
  }
  return { ok: true, value: { ops } };
}

const validateBody = (schemaName, body) => (schemaName === 'batch' ? validateBatch(body) : validateReserve(body));

module.exports = Object.freeze({
  roles: base.roles, identities: base.identities, fixed: FIXED, claimFields: CLAIM_FIELDS, serverFields: SERVER_FIELDS, states: STATES, routes: ROUTES, roleTable: ROLE_TABLE,
  conductors: config.CONDUCTORS, tiers: config.TIERS, priceVersion: config.PRICE_VERSION, resolveConfig: config.resolveConfig,
  isId, isKey, resolve, allowedMethods, parseQuery, validateBody
});
