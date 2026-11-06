'use strict';

// C010 contract: the closed route table, the role table (deny by default), id shapes, body schemas, the query vocabulary and the limits.
// Pure data and pure functions; nothing here touches a socket or the state. Identities, roles, the claim fields and the resource bounds of
// the connection come from the accepted C009 fixture (imported read-only, pinned in imports.json).
const base = require('../C009/contract.js');

const LIMITS = Object.freeze({
  bodyBytes: base.limits.bodyBytes, idleMs: base.limits.idleMs, connections: base.limits.connections, pipelined: base.limits.pipelined,
  headerMs: base.limits.headerMs, checkMs: base.limits.checkMs, auditEntries: base.limits.auditEntries, anonymousEntries: base.limits.anonymousEntries,
  maxTtlMs: base.limits.maxTtlMs,
  // One identity holds at most ownerEntries leases and resources in all. Nothing else bounds the state: the shares of all conductors
  // always fit, so one conductor can never fill what another one needs (the per-owner quota C009 F4 asked for).
  ownerEntries: 100,
  batchOps: 10, pageDefault: 20, pageMax: 50, offsetMax: 10000, urlChars: 2048
});
const CLAIM_FIELDS = base.claimFields;
const SERVER_FIELDS = Object.freeze(['id', 'lease', 'leaseId', 'kind', 'state', 'revision', 'createdAtMs', 'expiresAtMs', 'ownerSubject']);
const FOLDERS = Object.freeze({ runs: 'run', scratches: 'scratch', exports: 'export' });
const HEX = '[0-9a-f]{8,32}';
const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
const ID_SHAPES = Object.freeze({
  lease: new RegExp(`^lease-${HEX}$`), run: new RegExp(`^run-${HEX}$`), scratch: new RegExp(`^scratch-${HEX}$`), export: new RegExp(`^export-${HEX}$`)
});
const isName = (value) => typeof value === 'string' && NAME.test(value);
const isId = (kind, value) => Object.hasOwn(ID_SHAPES, kind) && typeof value === 'string' && ID_SHAPES[kind].test(value);
const isInteger = (min, max) => (value) => Number.isInteger(value) && value >= min && value <= max;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const LEASE_PATH = new RegExp(`^/v1/leases/(?<lease>lease-${HEX})$`);
const CANCEL_PATH = new RegExp(`^/v1/leases/(?<lease>lease-${HEX})/runs/(?<id>run-${HEX})/cancel$`);
const LIST_QUERY = Object.freeze(['limit', 'offset', 'sort', 'q']);
const PAGE_QUERY = Object.freeze(['limit', 'offset']);
const entry = (name, method, path, extra = {}) => Object.freeze({ name, method, path, query: null, body: null, mutating: false, public: false, kind: null, ...extra });
const routeList = [
  entry('asset.index', 'GET', /^\/$/, { public: true }), entry('asset.page', 'GET', /^\/page\.js$/, { public: true }),
  entry('asset.style', 'GET', /^\/style\.css$/, { public: true }), entry('scope', 'GET', /^\/scope\.json$/, { public: true }),
  entry('me', 'GET', /^\/v1\/me$/),
  entry('lease.create', 'POST', /^\/v1\/leases$/, { body: 'lease', mutating: true }), entry('lease.list', 'GET', /^\/v1\/leases$/, { query: LIST_QUERY }),
  entry('lease.read', 'GET', LEASE_PATH), entry('lease.end', 'DELETE', LEASE_PATH, { mutating: true })
];
for (const [folder, kind] of Object.entries(FOLDERS)) {
  const folderPath = new RegExp(`^/v1/leases/(?<lease>lease-${HEX})/${folder}$`);
  const itemPath = new RegExp(`^/v1/leases/(?<lease>lease-${HEX})/${folder}/(?<id>${kind}-${HEX})$`);
  routeList.push(entry('resource.list', 'GET', folderPath, { query: LIST_QUERY, kind }), entry('resource.create', 'POST', folderPath, { body: kind, mutating: true, kind }),
    entry('resource.read', 'GET', itemPath, { kind }), entry('resource.delete', 'DELETE', itemPath, { mutating: true, kind }));
  if (kind !== 'export') routeList.push(entry('resource.update', 'PATCH', itemPath, { body: `${kind}.patch`, mutating: true, kind }));
}
routeList.push(entry('run.cancel', 'POST', CANCEL_PATH, { mutating: true, kind: 'run' }), entry('batch', 'POST', /^\/v1\/batch$/, { body: 'batch', mutating: true }),
  entry('operator.leases', 'GET', /^\/v1\/operator\/leases$/, { query: PAGE_QUERY }), entry('operator.audit', 'GET', /^\/v1\/operator\/audit$/, { query: PAGE_QUERY }));
const ROUTES = Object.freeze(routeList);

// Deny by default: a route that is not listed here is 404 for everyone, a route without roles is 403 for everyone, and roles do not inherit.
const ANYONE = ['visitor', 'conductor', 'operator'];
const ROLE_TABLE = Object.freeze(Object.fromEntries([
  ['me', ANYONE], ...['lease.create', 'lease.list', 'lease.read', 'lease.end', 'resource.list', 'resource.create', 'resource.read', 'resource.update', 'resource.delete', 'run.cancel', 'batch'].map((name) => [name, ['conductor']]),
  ['operator.leases', ['operator']], ['operator.audit', ['operator']]
].map(([name, roles]) => [name, Object.freeze({ roles: Object.freeze(roles) })])));

// Every route whose path matches (a path can serve several methods) and the named parameters of that path; null when none matches.
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
  limit: (text) => (/^[0-9]{1,2}$/.test(text) && Number(text) >= 1 && Number(text) <= LIMITS.pageMax ? Number(text) : undefined),
  offset: (text) => (/^[0-9]{1,5}$/.test(text) && Number(text) <= LIMITS.offsetMax ? Number(text) : undefined),
  sort: (text) => (text === 'created' || text === 'name' ? text : undefined),
  q: (text) => (/^[a-z0-9-]{1,32}$/.test(text) ? text : undefined)
});
const REJECTED = Object.freeze({ ok: false, code: 'QUERY_REJECTED' });

// The query is a closed vocabulary per route: a name outside it (an owner, a lease, a method override), a repeated name or a value outside its
// bounds is refused, and nothing in it ever names a target.
function parseQuery(route, raw) {
  if (route.query === null) return raw === '' ? { ok: true, value: {} } : { ok: false, code: 'QUERY_NOT_ALLOWED' };
  const value = { limit: LIMITS.pageDefault, offset: 0, sort: 'created', q: null };
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
const FIELDS = Object.freeze({
  lease: { name: isName, ttlMs: isInteger(1, LIMITS.maxTtlMs) }, run: { name: isName, units: isInteger(1, 100) }, scratch: { name: isName },
  export: { name: isName, runId: (value) => isId('run', value) }, 'run.patch': { name: isName, units: isInteger(1, 100) }, 'scratch.patch': { name: isName }
});
const PARTIAL = new Set(['run.patch', 'scratch.patch']);

// Fields first (a claimed owner or role, a server-owned field, an unknown name), then the required values. Only names from closed lists are echoed.
function checkFields(allowed, body) {
  for (const field of Object.keys(body)) {
    if (allowed.includes(field)) continue;
    if (CLAIM_FIELDS.includes(field)) return failure('IDENTITY_CLAIM_REJECTED', field);
    return SERVER_FIELDS.includes(field) ? failure('SERVER_FIELD_REJECTED', field) : failure('INPUT_UNKNOWN_FIELD');
  }
  return null;
}

function validateFields(schemaName, body) {
  if (!isObject(body)) return failure('BODY_NOT_OBJECT');
  const schema = FIELDS[schemaName];
  const refused = checkFields(Object.keys(schema), body);
  if (refused) return refused;
  const value = {};
  for (const field of Object.keys(schema)) {
    if (!Object.hasOwn(body, field)) {
      if (PARTIAL.has(schemaName)) continue;
      return failure('INPUT_MISSING_FIELD', field);
    }
    if (!schema[field](body[field])) return failure('INPUT_INVALID', field);
    value[field] = body[field];
  }
  return PARTIAL.has(schemaName) && Object.keys(value).length === 0 ? failure('INPUT_INVALID') : { ok: true, value };
}

const OP_FIELDS = Object.freeze({ delete: ['op', 'lease', 'kind', 'id'], cancel: ['op', 'lease', 'kind', 'id'], update: ['op', 'lease', 'kind', 'id', 'patch'] });
const OP_KINDS = Object.freeze({ delete: ['run', 'scratch', 'export'], cancel: ['run'], update: ['run', 'scratch'] });

function validateOp(operation) {
  if (!isObject(operation)) return failure('INPUT_INVALID', 'ops');
  const verb = operation.op;
  if (typeof verb !== 'string' || !Object.hasOwn(OP_FIELDS, verb)) return failure('INPUT_INVALID', 'op');
  const refused = checkFields(OP_FIELDS[verb], operation);
  if (refused) return refused;
  for (const field of OP_FIELDS[verb]) if (!Object.hasOwn(operation, field)) return failure('INPUT_MISSING_FIELD', field);
  if (!isId('lease', operation.lease)) return failure('INPUT_INVALID', 'lease');
  if (!OP_KINDS[verb].includes(operation.kind)) return failure('INPUT_INVALID', 'kind');
  if (!isId(operation.kind, operation.id)) return failure('INPUT_INVALID', 'id');
  const value = { op: verb, lease: operation.lease, kind: operation.kind, id: operation.id };
  if (verb !== 'update') return { ok: true, value };
  const patch = validateFields(`${operation.kind}.patch`, operation.patch);
  return patch.ok ? { ok: true, value: { ...value, patch: patch.value } } : patch;
}

function validateBatch(body) {
  if (!isObject(body)) return failure('BODY_NOT_OBJECT');
  const refused = checkFields(['ops'], body);
  if (refused) return refused;
  if (!Object.hasOwn(body, 'ops')) return failure('INPUT_MISSING_FIELD', 'ops');
  if (!Array.isArray(body.ops) || body.ops.length < 1 || body.ops.length > LIMITS.batchOps) return failure('INPUT_INVALID', 'ops');
  const ops = [];
  for (const operation of body.ops) {
    const checked = validateOp(operation);
    if (!checked.ok) return checked;
    ops.push(checked.value);
  }
  return { ok: true, value: { ops } };
}

const validateBody = (schemaName, body) => (schemaName === 'batch' ? validateBatch(body) : validateFields(schemaName, body));
// The limits a server may be built with; the others are part of the contract (the validators above use them).
const TUNABLE = Object.freeze(['bodyBytes', 'idleMs', 'connections', 'pipelined', 'headerMs', 'checkMs', 'auditEntries', 'anonymousEntries', 'ownerEntries']);

module.exports = Object.freeze({
  roles: base.roles, identities: base.identities, limits: LIMITS, tunable: TUNABLE, claimFields: CLAIM_FIELDS, serverFields: SERVER_FIELDS, folders: FOLDERS, routes: ROUTES,
  roleTable: ROLE_TABLE, idShapes: ID_SHAPES, isId, isName, resolve, allowedMethods, parseQuery, validateBody
});
