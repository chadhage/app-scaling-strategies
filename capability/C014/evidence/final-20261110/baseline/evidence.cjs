'use strict';

// The raw store and the publisher of public evidence. Everything the service touches is kept RAW here (request headers, URLs, error messages and
// causes, the upstream call with its credential, the contacts of the people who asked): management data that no route serves. What a reader sees is
// built in exactly three places, itemBody(), listBody() and bundleBody(), and every one of them ends in redactor.publish().
const { KINDS } = require('./redact.cjs');

const RING = 200;
const ERROR_DEPTH = 4;

// An error and its causes become steps; only the message is read (never the stack), and it is masked later like any free text.
function errorSteps(error) {
  const steps = [];
  let current = error;
  for (let depth = 0; depth < ERROR_DEPTH && current !== null && typeof current === 'object'; depth += 1) {
    steps.push({ event: 'failure', detail: typeof current.message === 'string' ? current.message : '' });
    current = current.cause;
  }
  return steps;
}

const stepsOf = (raw) => [...(Array.isArray(raw.steps) ? raw.steps : []), ...(raw.error === undefined ? [] : errorSteps(raw.error))];
// What the redactor is shown for each kind: the raw record with its sequence, its steps (errors folded in) and, for a run, only the count of its files.
const RAW_VIEW = Object.freeze({
  trace: (entry) => ({ ...entry.raw, seq: entry.seq, steps: stepsOf(entry.raw) }),
  logs: (entry) => ({ ...entry.raw, seq: entry.seq }),
  runs: (entry) => ({ ...entry.raw, artifacts: Array.isArray(entry.raw.artifacts) ? entry.raw.artifacts.length : 0, steps: stepsOf(entry.raw) }),
  audit: (entry) => entry.raw
});

function createEvidence({ redactor, ledger, sign }) {
  const stores = { trace: [], logs: [] };
  const sequence = { trace: 0, logs: 0 };
  // A published item is kept until the redactor learns a new secret (its epoch changes): records never change after they are written.
  const slots = { audit: new WeakMap(), runs: new Map() };

  function record(kind, raw) {
    sequence[kind] += 1;
    stores[kind].push({ seq: sequence[kind], raw, epoch: -1, body: null });
    if (stores[kind].length > RING) stores[kind].splice(0, stores[kind].length - RING);
    return sequence[kind];
  }

  function entriesOf(kind) {
    if (kind === 'trace' || kind === 'logs') return stores[kind];
    if (kind === 'audit') return ledger.auditLog().map((raw) => ({ seq: raw.seq, raw }));
    return ledger.snapshot().state.runs.map((raw) => ({ seq: raw.id, raw }));
  }

  function slotOf(kind, entry) {
    if (kind !== 'audit' && kind !== 'runs') return entry;
    const key = kind === 'audit' ? entry.raw : entry.raw.id;
    if (!slots[kind].has(key)) slots[kind].set(key, { epoch: -1, body: null });
    return slots[kind].get(key);
  }

  function itemBody(kind, entry) {
    const slot = slotOf(kind, entry);
    const epoch = redactor.epoch();
    if (slot.epoch !== epoch) {
      let view = null;
      try { view = RAW_VIEW[kind](entry); } catch { /* a record that cannot be read is published as nothing */ }
      slot.body = redactor.publish(kind, view);
      slot.epoch = epoch;
    }
    return slot.body;
  }

  const itemsOf = (kind, entries) => entries.map((entry) => itemBody(kind, entry)).filter((body) => body.value !== null);

  function listBody(kind, limit) {
    const entries = entriesOf(kind);
    const items = itemsOf(kind, entries.slice(-limit));
    return redactor.publish('list', { outcome: 'ok', kind, revision: ledger.snapshot().revision, total: entries.length, shown: items.length, limit, items });
  }

  // The export: every kind through the same item path, the unsigned bundle published, then signed (HMAC over exactly its JSON text) and published again.
  function bundleBody() {
    const parts = Object.fromEntries(KINDS.map((kind) => [kind, itemsOf(kind, entriesOf(kind).slice(-RING))]));
    const unsigned = redactor.publish('bundle', {
      schema: 'c014-evidence/1', revision: ledger.snapshot().revision, counts: Object.fromEntries(KINDS.map((kind) => [kind, parts[kind].length])), ...parts
    });
    return redactor.publish('signedBundle', { ...unsigned.value, signature: { alg: 'HMAC-SHA256', value: sign(JSON.stringify(unsigned)) } });
  }

  return { record, listBody, bundleBody, size: (kind) => stores[kind].length };
}

module.exports = Object.freeze({ RING, createEvidence, errorSteps });
