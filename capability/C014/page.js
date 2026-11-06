(function inspector() {
  'use strict';

  // Browser-only script. It asks for the four public documents, VALIDATES every one against a closed shape (exact fields, closed vocabularies, shown-of-total
  // reconciliation) and prints only values it checked itself: ids, integers and closed words. It never prints a string the server sent, so a tampered
  // answer can only be rejected, never shown. The vocabularies below are compared with the server's by tests/page.test.cjs.
  const KINDS = ['trace', 'runs', 'audit', 'logs'];
  const ROLES = ['visitor', 'conductor', 'operator'];
  const SUBJECTS = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
  const ROUTES = ['asset', 'scope', 'evidence', 'manage', 'command', 'unknown'];
  const COMMANDS = ['run.create', 'config.check'];
  const CODES = ['ok', 'AUTHENTICATION_REQUIRED', 'TOKEN_MALFORMED', 'TOKEN_UNKNOWN', 'TOKEN_EXPIRED', 'COMMAND_NAME_INVALID', 'COMMAND_UNKNOWN', 'ROLE_FORBIDDEN',
    'QUERY_NOT_ALLOWED', 'QUERY_INVALID', 'MEDIA_TYPE_UNSUPPORTED', 'BODY_TOO_LARGE', 'BODY_INVALID_JSON', 'BODY_NOT_OBJECT', 'IDENTITY_CLAIM_REJECTED', 'INPUT_UNKNOWN_FIELD',
    'INPUT_MISSING_FIELD', 'INPUT_INVALID', 'ALREADY_APPROVED', 'STATE_FULL', 'OWNER_QUOTA_FULL', 'COMMAND_NOT_IMPLEMENTED', 'COMMAND_FAILED', 'METHOD_NOT_ALLOWED', 'UNEXPECTED_BODY',
    'URL_TOO_LONG', 'INVALID_URL', 'NOT_FOUND', 'LOCAL_HOST_REQUIRED', 'CROSS_ORIGIN_DENIED', 'EXPECTATION_FAILED', 'REQUEST_MALFORMED', 'HEADERS_TOO_LARGE', 'REQUEST_TIMEOUT', 'INTERNAL_ERROR'];
  const EVENTS = ['dispatch', 'connect', 'response', 'failure', 'note'];
  const LIMIT = 50;
  const DEADLINE_MS = 10000;

  const int = (value) => Number.isSafeInteger(value) && value >= 0;
  const oneOf = (...values) => (value) => values.includes(value);
  const orNull = (check) => (value) => value === null || check(value);
  const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
  const steps = (value) => Array.isArray(value) && value.length <= 8 && value.every((step) => exactKeys(step, ['event', 'detail']) && EVENTS.includes(step.event) && typeof step.detail === 'string');
  const SHAPES = {
    trace: { seq: int, kind: oneOf('request', 'upstream', 'store', 'error'), method: oneOf('GET', 'POST', 'OTHER'), route: oneOf(...ROUTES), status: int, role: orNull(oneOf(...ROLES)), code: orNull(oneOf(...CODES)), steps },
    runs: { id: (value) => typeof value === 'string' && /^run-\d{4,9}$/.test(value), units: int, owner: orNull(oneOf(...SUBJECTS)), revision: int, status: oneOf('ok', 'failed'), artifacts: int, steps },
    audit: { seq: int, outcome: oneOf('applied', 'denied', 'rejected', 'unauthenticated', 'failed'), code: orNull(oneOf(...CODES)), command: orNull(oneOf(...COMMANDS)), subject: orNull(oneOf(...SUBJECTS)), role: orNull(oneOf(...ROLES)) },
    logs: { seq: int, level: oneOf('info', 'warn', 'error'), event: oneOf('request', 'command', 'upstream', 'store', 'startup'), route: oneOf(...ROUTES), status: int, code: orNull(oneOf(...CODES)), role: orNull(oneOf(...ROLES)) }
  };
  const COLUMNS = { trace: ['seq', 'kind', 'method', 'route', 'status', 'role', 'code', 'steps'], runs: ['id', 'units', 'owner', 'revision', 'status', 'artifacts', 'steps'],
    audit: ['seq', 'outcome', 'code', 'command', 'subject', 'role'], logs: ['seq', 'level', 'event', 'route', 'status', 'code', 'role'] };

  function validItem(kind, item) {
    return exactKeys(item, Object.keys(SHAPES[kind])) && Object.keys(SHAPES[kind]).every((field) => SHAPES[kind][field](item[field]));
  }

  // The document the server must send for GET /v1/evidence/<kind>?limit=50, or a reason it is not that document.
  function validList(kind, doc) {
    if (!exactKeys(doc, ['outcome', 'kind', 'revision', 'total', 'shown', 'limit', 'items'])) return false;
    return doc.outcome === 'ok' && doc.kind === kind && int(doc.revision) && int(doc.total) && int(doc.shown) && doc.limit === LIMIT && Array.isArray(doc.items)
      && doc.shown === doc.items.length && doc.shown <= doc.total && doc.items.length <= doc.limit && doc.items.every((item) => validItem(kind, item));
  }

  // Wording is derived from facts the page validated; nothing the server wrote is printed.
  const cell = (value) => (value === null ? '\u2014' : Array.isArray(value) ? `${value.length}` : String(value));
  const countLine = (doc) => `Showing ${doc.shown} of ${doc.total} entries (limit ${doc.limit}); revision ${doc.revision}.`;

  function render(kind, doc) {
    const body = document.getElementById(`rows-${kind}`);
    body.replaceChildren(...doc.items.map((item) => {
      const row = document.createElement('tr');
      for (const column of COLUMNS[kind]) {
        const td = document.createElement('td');
        td.textContent = cell(item[column]);
        row.appendChild(td);
      }
      return row;
    }));
    document.getElementById(`count-${kind}`).textContent = countLine(doc);
  }

  function reject(kind, reason) {
    document.getElementById(`rows-${kind}`).replaceChildren();
    const line = document.getElementById(`count-${kind}`);
    line.textContent = `Rejected: ${reason}`;
    line.className = 'rejected';
  }

  async function load(kind) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
    try {
      const response = await fetch(`/v1/evidence/${kind}?limit=${LIMIT}`, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
      if (response.status !== 200) return reject(kind, `the server answered HTTP ${Number(response.status) || 0} instead of the evidence document.`);
      const doc = await response.json();
      if (!validList(kind, doc)) return reject(kind, 'the answer did not match the closed shape and is not shown.');
      document.getElementById(`count-${kind}`).className = '';
      render(kind, doc);
      return doc;
    } catch (error) {
      return reject(kind, error && error.name === 'AbortError' ? `no answer within ${DEADLINE_MS / 1000} seconds.` : 'the answer could not be read.');
    } finally {
      clearTimeout(timer);
    }
  }

  async function run() {
    const status = document.getElementById('status');
    status.textContent = 'Loading evidence.';
    const docs = await Promise.all(KINDS.map(load));
    const ok = docs.filter((doc) => doc && doc.items);
    const shown = ok.reduce((sum, doc) => sum + doc.shown, 0);
    const total = ok.reduce((sum, doc) => sum + doc.total, 0);
    status.textContent = ok.length === KINDS.length
      ? `Loaded ${ok.length} of ${KINDS.length} sections: ${shown} of ${total} entries shown.`
      : `Loaded ${ok.length} of ${KINDS.length} sections; ${KINDS.length - ok.length} rejected. ${shown} of ${total} entries shown from the sections that passed.`;
    return docs;
  }

  document.getElementById('reload').addEventListener('click', () => { run(); });
  globalThis.C014Page = Object.freeze({ KINDS, ROLES, SUBJECTS, ROUTES, COMMANDS, CODES, EVENTS, SHAPES, validList, run });
  run();
}());
