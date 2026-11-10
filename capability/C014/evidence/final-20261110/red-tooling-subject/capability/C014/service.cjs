'use strict';

// The service: the management side (vault), the raw store and the redacted publisher, composed with the accepted C009 authorization fixture
// (token registry, permission table, command pipeline, ledger, queue). C009 files are imported read-only (imports.json pins them).
const { randomBytes: nodeRandomBytes } = require('node:crypto');
const contract = require('../C009/contract.js');
const { createTokenRegistry } = require('../C009/authz.cjs');
const { createCommandPipeline } = require('../C009/commands.cjs');
const { createLedger } = require('../C009/ledger.cjs');
const { createQueue } = require('../C009/queue.cjs');
const { ConfigError, createVault } = require('./vault.cjs');
const { createRedactor } = require('./redact.cjs');
const { createEvidence } = require('./evidence.cjs');

const TABLE = Object.freeze({ 'run.create': Object.freeze({ roles: Object.freeze(['conductor']) }), 'config.check': Object.freeze({ roles: Object.freeze(['operator']) }) });
const MODES = ['ok', 'fail'];
const METHODS = { GET: 'GET', POST: 'POST' };
const SCOPE = Object.freeze({
  outcome: 'ok',
  scope: { cardId: 'C014', businessData: 'synthetic', transport: '127.0.0.1 HTTP only', persistence: 'none', secretsServerSide: true, publicEvidenceRedacted: true, liveAzureRuns: 0, authorizedCloudSpend: 0 }
});

// run.create keeps C009's schema; config.check takes one field, mode, and the same closed refusals (identity claims, unknown, missing, invalid).
function validateInput(command, body) {
  if (command === 'run.create') return contract.validateInput(command, body);
  if (command !== 'config.check') return { ok: false, code: 'COMMAND_UNKNOWN' };
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { ok: false, code: 'BODY_NOT_OBJECT' };
  for (const field of Object.keys(body)) {
    if (contract.claimFields.includes(field)) return { ok: false, code: 'IDENTITY_CLAIM_REJECTED', field };
    if (field !== 'mode') return { ok: false, code: 'INPUT_UNKNOWN_FIELD', field };
  }
  if (!Object.hasOwn(body, 'mode')) return { ok: false, code: 'INPUT_MISSING_FIELD', field: 'mode' };
  return MODES.includes(body.mode) ? { ok: true, value: { mode: body.mode } } : { ok: false, code: 'INPUT_INVALID', field: 'mode' };
}

// A raw record with the value in every position a careless system could keep it: free text, unknown fields, an authorization header, PII,
// nested arrays and objects, a file name, and an object KEY.
const everywhere = (value) => ({
  note: value, authorization: `Bearer ${value}`, requester: { name: value, email: value, phone: value }, nested: [[value], { deep: [value] }],
  artifacts: [{ file: value }], [value]: value, steps: [{ event: 'note', detail: value }]
});

function createService({ config, logSink = () => {}, limits = {}, now } = {}) {
  const vault = createVault(config);
  const redactor = createRedactor({ secrets: vault.secrets() });
  const registry = createTokenRegistry({ now, randomBytes: (size) => vault.tokenSource() || nodeRandomBytes(size) });
  for (const identity of vault.identities) {
    if (registry.issue(identity, { ttlMs: contract.limits.maxTtlMs }) !== config.tokens[identity]) throw new ConfigError('tokens');
  }
  const bounds = { ...contract.limits, ...limits };
  const ledger = createLedger(bounds.auditEntries, bounds.entries, { ownerLimit: bounds.ownerEntries, anonymousLimit: bounds.anonymousEntries });
  const evidence = createEvidence({ redactor, ledger, sign: (text) => vault.sign(text) });
  const revision = () => ledger.snapshot().revision;

  const handlers = Object.freeze({
    'run.create'(draft, { actor, input }) {
      const id = `run-${String(draft.runs.length + 1).padStart(4, '0')}`;
      const upstream = vault.dispatch(id, input.units, actor.subject);
      draft.runs.push({
        id, name: input.name, units: input.units, owner: actor.subject, revision: revision() + 1, status: 'ok', artifacts: [{ file: `${input.name}.csv` }],
        requester: vault.contactFor(actor.subject), upstream: upstream.request, steps: upstream.steps
      });
      evidence.record('trace', { kind: 'upstream', method: 'POST', route: 'command', status: 202, role: actor.role, code: 'ok', headers: upstream.request.headers, steps: upstream.steps });
      return { id };
    },
    'config.check'(draft, { actor, input }) {
      try {
        const { steps } = vault.checkStore(input.mode);
        evidence.record('trace', { kind: 'store', method: 'POST', route: 'command', status: 200, role: actor.role, code: 'ok', steps });
        return { checked: true };
      } catch (error) {
        evidence.record('trace', { kind: 'error', method: 'POST', route: 'command', status: 500, role: actor.role, code: 'COMMAND_FAILED', error, stack: error.stack });
        throw error;
      }
    }
  });
  const handleCommand = createCommandPipeline({ registry, table: TABLE, handlers, hooks: {}, validate: validateInput, ledger, queue: createQueue() });

  // One request, as the management side records it (raw, with its headers and URL) and as the console shows it (the redacted log item only).
  function recordRequest({ method, route, status, code, role, url, headers }) {
    const raw = { kind: 'request', method: METHODS[method] || 'OTHER', route, status, role, code, url, headers };
    evidence.record('trace', raw);
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    const log = { level, event: 'request', route, status, code, role, message: `${method} ${url} ${headers['user-agent'] || ''}` };
    const seq = evidence.record('logs', log);
    try { logSink(JSON.stringify(redactor.publish('logs', { ...log, seq }))); } catch { /* a failing sink never fails a request */ }
  }

  function plant(place, value) {
    const text = String(value);
    if (place === 'run') {
      ledger.commit((draft) => { draft.runs.push({ id: `run-${9001 + draft.runs.length}`, units: 1, owner: 'operator', revision: revision() + 1, status: 'ok', ...everywhere(text) }); return {}; },
        { actor: { subject: 'operator', role: 'operator' }, input: {} });
    } else if (place === 'trace') {
      evidence.record('trace', { kind: 'upstream', method: 'POST', route: 'command', status: 200, role: 'operator', code: 'ok', ...everywhere(text) });
    } else if (place === 'log') {
      evidence.record('logs', { level: 'info', event: 'request', route: 'command', status: 200, code: 'ok', role: 'operator', message: text, ...everywhere(text) });
    } else if (place === 'audit') {
      ledger.record({ outcome: 'applied', code: 'ok', command: 'run.create', subject: 'operator', role: 'operator', ...everywhere(text) });
    } else if (place === 'error') {
      const failure = new Error(text, { cause: new Error(text) });
      evidence.record('trace', { kind: 'error', method: 'POST', route: 'command', status: 500, role: 'operator', code: 'COMMAND_FAILED', error: failure, stack: failure.stack, ...everywhere(text) });
    } else {
      throw new RangeError('Unknown planting place');
    }
  }

  return {
    registry, table: TABLE, handleCommand, revision, plant, recordRequest,
    publish: (kind, value) => redactor.publish(kind, value),
    scopeBody: () => redactor.publish('scope', SCOPE),
    configBody: () => redactor.publish('config', { outcome: 'ok', configured: vault.status() }),
    listBody: evidence.listBody,
    bundleBody: evidence.bundleBody,
    // A token issued later is a secret as well: it is registered by value before anyone holds it.
    issueToken(identity, options) {
      const token = registry.issue(identity, options);
      redactor.register(token);
      return token;
    },
    auditLog: ledger.auditLog
  };
}

module.exports = Object.freeze({ TABLE, MODES, SCOPE, validateInput, createService });
