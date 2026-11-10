'use strict';

// THE redaction function. Every byte of public JSON this service produces comes out of publish(kind, value): an allow-list of fields with closed
// vocabularies (a field no rule names is never read, so it cannot be copied) plus masking by value (every registered secret, in every covered encoding,
// and the closed list of secret SHAPES below) in every free-text field. The closed lists and the covered encodings are documented in README.md.
const contract = require('../C009/contract.js');
const { CODES } = require('../C009/codes.cjs');
const canon = require('./canon.cjs');

const MASK = '[redacted]';
const LIMITS = Object.freeze({ textCap: 65536, text: 4096, entries: 200, steps: 8, claims: 32 });
// Shapes that are secrets whether or not the service was told about them (each is linear: bounded quantifiers, no nesting). The ORDER matters: the phone number, which
// masks any run of nine or more digits, comes LAST, so that it can never chew the digits of a long hex run, a blob or a token and leave its letters visible.
const PATTERNS = Object.freeze([
  ['management token', /c009_[A-Za-z0-9_-]{43}/g],
  ['bearer credential', /\bBearer\s+[a-z0-9._~+/-]{1,512}=*/gi],
  ['connection string secret', /\b(?:Password|Pwd|AccountKey|SharedAccessKey|SharedAccessSignature|ApiKey|Secret)\s*=\s*[^;\s,]{1,256}/gi],
  ['e-mail address', /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/g],
  ['json web token', /eyJ[A-Za-z0-9_-]{8,512}\.[A-Za-z0-9_-]{8,512}\.[A-Za-z0-9_-]{0,512}/g],
  ['long blob', /[A-Za-z0-9+/_-]{40,}={0,2}/g],
  ['long hex', /\b[0-9a-fA-F]{32,}\b/g],
  ['phone number', /\+?\d[\d ().-]{7,18}\d/g]
]);

const ROLES = contract.roles;
const SUBJECTS = Object.keys(contract.identities);
const COMMANDS = ['run.create', 'config.check'];
const CODE_LIST = ['ok', ...Object.keys(CODES)];
const ROUTE_CLASSES = ['asset', 'scope', 'evidence', 'manage', 'command', 'unknown'];
const CLAIM_HEADERS = ['role', 'roles', 'subject', 'owner', 'identity', 'x-role', 'x-roles', 'x-user-role', 'x-forwarded-role', 'x-user', 'x-forwarded-user', 'x-subject',
  'x-owner', 'x-identity', 'x-acting-as', 'x-ms-client-principal', 'x-ms-client-principal-id', 'x-ms-client-principal-name'];
const FIELD_NAMES = ['name', 'units', 'mode', ...contract.claimFields];
const KINDS = ['trace', 'runs', 'audit', 'logs'];

const int = (min, max, nullable = false) => ({ t: 'int', min, max, nullable });
const oneOf = (values) => ({ t: 'enum', values });
const text = { t: 'text' };
const array = (of, max) => ({ t: 'array', of, max });
const object = (fields, required = []) => ({ t: 'object', fields, required });
const runId = { t: 'id', re: /^run-\d{4,9}$/, nullable: true };
const count = int(0, 1000000000);
const roleOrNull = oneOf([...ROLES, null]);
const codeOrNull = oneOf([...CODE_LIST, null]);
const STEPS = array(object({ event: oneOf(['dispatch', 'connect', 'response', 'failure', 'note']), detail: text }, ['event', 'detail']), LIMITS.steps);
const ITEMS = {
  trace: object({ seq: count, kind: oneOf(['request', 'upstream', 'store', 'error']), method: oneOf(['GET', 'POST', 'OTHER']), route: oneOf(ROUTE_CLASSES),
    status: int(100, 599), role: roleOrNull, code: codeOrNull, steps: STEPS }, ['seq', 'kind', 'method', 'route', 'status', 'steps']),
  runs: object({ id: { t: 'id', re: /^run-\d{4,9}$/ }, units: int(0, 1000000), owner: oneOf([...SUBJECTS, null]), revision: count, status: oneOf(['ok', 'failed']),
    artifacts: int(0, 1000), steps: STEPS }, ['id', 'units', 'revision', 'status', 'artifacts', 'steps']),
  audit: object({ seq: count, outcome: oneOf(['applied', 'denied', 'rejected', 'unauthenticated', 'failed']), code: codeOrNull, command: oneOf([...COMMANDS, null]),
    subject: oneOf([...SUBJECTS, null]), role: roleOrNull }, ['seq', 'outcome']),
  logs: object({ seq: count, level: oneOf(['info', 'warn', 'error']), event: oneOf(['request', 'command', 'upstream', 'store', 'startup']), route: oneOf(ROUTE_CLASSES),
    status: int(100, 599), code: codeOrNull, role: roleOrNull }, ['seq', 'level', 'event', 'route', 'status'])
};
const COUNTS = object({ trace: count, runs: count, audit: count, logs: count });
const bundle = (member) => ({ schema: oneOf(['c014-evidence/1']), revision: count, counts: COUNTS, ...Object.fromEntries(KINDS.map((kind) => [kind, array(member(kind), LIMITS.entries)])) });
const SCHEMAS = Object.freeze({
  ...ITEMS,
  list: object({ outcome: oneOf(['ok']), kind: oneOf(KINDS), revision: count, total: count, shown: count, limit: int(1, LIMITS.entries), items: array({ t: 'public' }, LIMITS.entries) }),
  bundle: object(bundle(() => ({ t: 'public' }))),
  signedBundle: object({ ...bundle((kind) => ITEMS[kind]), signature: object({ alg: oneOf(['HMAC-SHA256']), value: { t: 'hex', length: 64 } }, ['alg', 'value']) }),
  answer: object({ outcome: oneOf(['ok']), command: oneOf(COMMANDS), revision: count, actor: object({ subject: oneOf(SUBJECTS), role: oneOf(ROLES) }, ['subject', 'role']),
    result: object({ id: runId, checked: { t: 'bool', nullable: true } }), auditSeq: count, ignoredClaims: array(oneOf(CLAIM_HEADERS), LIMITS.claims) }),
  error: object({ outcome: oneOf(CODE_LIST), error: object({ code: oneOf(CODE_LIST), message: text }), role: roleOrNull, command: oneOf([...COMMANDS, null]),
    requiredRoles: array(oneOf(ROLES), ROLES.length), field: oneOf([...FIELD_NAMES, null]), auditSeq: int(0, 1000000000, true), ignoredClaims: array(oneOf(CLAIM_HEADERS), LIMITS.claims) }),
  scope: object({ outcome: oneOf(['ok']), scope: object({ cardId: oneOf(['C014']), businessData: oneOf(['synthetic']), transport: oneOf(['127.0.0.1 HTTP only']),
    persistence: oneOf(['none']), secretsServerSide: { t: 'bool' }, publicEvidenceRedacted: { t: 'bool' }, liveAzureRuns: int(0, 0), authorizedCloudSpend: int(0, 0) }) }),
  config: object({ outcome: oneOf(['ok']), configured: object({ tokens: count, signingKey: { t: 'bool' }, connectionString: { t: 'bool' }, serviceCredential: { t: 'bool' }, contacts: count }) })
});

const BRAND = Symbol('C014 public body');
// The only thing the HTTP layer may send as JSON: minted by publish() alone, frozen, and serialised through toJSON().
class PublicBody {
  constructor(value, redactions, brand) {
    if (brand !== BRAND) throw new TypeError('A PublicBody is made by publish() only');
    this.value = value;
    this.redactions = redactions;
    Object.freeze(this);
  }

  toJSON() { return this.value; }
}
const isPublicBody = (value) => value instanceof PublicBody;

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Reads one own property; a getter or a proxy that throws reads as absent.
function read(holder, key) {
  try { return Object.hasOwn(holder, key) ? holder[key] : undefined; } catch { return undefined; }
}

function createRedactor({ secrets = [], limits = LIMITS } = {}) {
  const registry = new Map();
  let ordered = [];
  let epoch = 0;

  function register(value) {
    if (typeof value !== 'string' || value.length < canon.MIN_SECRET) return false;
    if (!registry.has(value)) {
      registry.set(value, canon.needlesFor(value));
      ordered = [...registry.keys()].sort((first, second) => second.length - first.length);
      epoch += 1;
    }
    return true;
  }
  secrets.forEach(register);

  // Exact occurrences are replaced in place; every other form (case, NFKC, format characters, URL, HTML and \u escapes, plus for space, base64, hex) of a registered secret masks
  // the WHOLE text. That check looks at the ORIGINAL text and runs BEFORE the exact replacements: a registered part of a secret (a surname, an e-mail local part) that stands
  // verbatim inside an encoded form of the whole must not consume the evidence, and a shape (a phone number, a blob) must never chew a part of a secret either (the shapes
  // run last). The text is cut at the limit only after masking.
  function maskText(input) {
    if (typeof input !== 'string' || input.length > limits.textCap) return MASK;
    if (canon.encodedIn(input, registry)) return MASK;
    let value = canon.replaceVerbatim(input, ordered, MASK);
    for (const [, shape] of PATTERNS) value = value.replace(shape, MASK);
    return value.length > limits.text ? `${value.slice(0, limits.text)}\u2026` : value;
  }

  function walk(node, value, state) {
    const miss = () => { if (value !== undefined && value !== null) state.redactions += 1; return null; };
    switch (node.t) {
      case 'int': return Number.isSafeInteger(value) && value >= node.min && value <= node.max ? value : (node.nullable && value === null ? null : miss());
      case 'bool': return typeof value === 'boolean' ? value : miss();
      case 'enum': return node.values.includes(value) ? value : miss();
      case 'id': return (typeof value === 'string' && node.re.test(value)) || (node.nullable && value === null) ? value : miss();
      case 'hex': return typeof value === 'string' && value.length === node.length && /^[0-9a-f]+$/.test(value) ? value : miss();
      case 'text': {
        if (typeof value !== 'string') return miss();
        const masked = maskText(value);
        if (masked !== value) state.redactions += 1;
        return masked;
      }
      case 'public': return isPublicBody(value) ? value.value : miss();
      case 'array': {
        if (!Array.isArray(value)) return miss();
        const out = [];
        const size = Math.min(value.length, node.max);
        for (let index = 0; index < size; index += 1) {
          const entry = walk(node.of, read(value, index), state);
          if (entry !== null) out.push(entry);
        }
        if (value.length > node.max) state.redactions += 1;
        return out;
      }
      default: {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return miss();
        const out = Object.fromEntries(Object.entries(node.fields).map(([field, child]) => [field, walk(child, read(value, field), state)]));
        // an object whose required field is invalid is dropped whole (never published half-formed)
        if (node.required.some((field) => out[field] === null)) { state.redactions += 1; return null; }
        return out;
      }
    }
  }

  function publish(kind, value) {
    if (!Object.hasOwn(SCHEMAS, kind)) throw new RangeError('Unknown public kind');
    const state = { redactions: 0 };
    let doc = null;
    try { doc = walk(SCHEMAS[kind], value, state); } catch { state.redactions += 1; }
    return new PublicBody(deepFreeze(doc), state.redactions, BRAND);
  }

  return { register, maskText, publish, epoch: () => epoch, size: () => registry.size };
}

module.exports = Object.freeze({
  MASK, LIMITS, PATTERNS, SCHEMAS, ROLES, SUBJECTS, COMMANDS, CODE_LIST, ROUTE_CLASSES, CLAIM_HEADERS, KINDS, createRedactor, isPublicBody
});
