(function () {
  'use strict';

  const contract = globalThis.C042Contract;
  const $ = (id) => document.getElementById(id);
  const sample = (patch) => JSON.stringify({
    schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'demo-key-0001', leaseId: 'synthetic-lease-001', units: 5, ...patch,
  });
  const PRESETS = {
    valid: sample({}),
    conflict: sample({ units: 6 }),
    duplicate: sample({}).replace('"units":5', '"units":5,"units":6'),
    prototype: sample({}).replace('"units":5', '"units":5,"__proto__":{"units":1}'),
    range: sample({ units: 11 }),
    unsupported: sample({ step: 'release-capacity' }),
  };
  const state = { busy: false, lastRequest: null, lastKey: null };

  function node(tag, content, className) {
    const element = document.createElement(tag);
    element.textContent = content;
    if (className) element.className = className;
    return element;
  }

  function status(message) {
    $('status').textContent = message;
  }

  function reset() {
    $('inputs').textContent = 'No validated input.';
    for (const id of ['result', 'did-not', 'details', 'trail']) $(id).replaceChildren();
    $('recovery').textContent = 'No result yet.';
  }

  function setBusy(busy) {
    state.busy = busy;
    for (const id of ['submit', 'inspect', 'load']) $(id).disabled = busy;
  }

  function keyOf(text) {
    try {
      const value = JSON.parse(text);
      return typeof value.idempotencyKey === 'string' && contract.KEY_PATTERN.test(value.idempotencyKey) ? value.idempotencyKey : null;
    } catch {
      return null;
    }
  }

  // Only the controls the result offers are drawn; each one performs a real request or edit, nothing else.
  function controls(allowed) {
    if (allowed.length === 0) {
      $('recovery').textContent = 'No recovery control is offered for this result.';
      return;
    }
    $('recovery').replaceChildren(...allowed.map((name) => {
      const button = node('button', contract.ACTIONS[name].label);
      button.type = 'button';
      button.title = contract.ACTIONS[name].description;
      button.addEventListener('click', () => act(name));
      return button;
    }));
  }

  function render(envelope, httpStatus) {
    $('inputs').textContent = envelope.validatedInput ? JSON.stringify(envelope.validatedInput, null, 2) :
      'No validated input: the request was refused before it was accepted.';
    const rows = [
      ['HTTP status', String(httpStatus)], ['Request', envelope.action], ['Outcome', `${envelope.outcome} (${envelope.classification})`],
      ['Accepted', String(envelope.accepted)], ['Replayed', String(envelope.replayed)], ['Terminal', String(envelope.terminal)],
      ['Step state', envelope.step.state], ['Effect applied', String(envelope.effect.applied)],
      ['Applied by this request', String(envelope.effect.appliedByThisRequest)], ['Reserved after', String(envelope.effect.reservedAfter)],
      ['Typed code', envelope.error ? `${envelope.error.code} (${envelope.error.group})` : 'none'],
      ['Why', envelope.recovery.reason], ['Attempts', String(envelope.attempts)],
    ];
    $('result').replaceChildren(...rows.flatMap(([name, value]) => [node('dt', name), node('dd', value)]));
    $('did-not').replaceChildren(...envelope.didNot.map((item) => node('li', `${item.code}: ${item.text}`)));
    $('details').replaceChildren(...(envelope.error ? envelope.error.details : []).map((item) => node('li', `${item.path}: ${item.code}`)));
    $('trail').replaceChildren(...envelope.trail.map((item) => node('li', `#${item.seq} ${item.type}`)));
    controls(envelope.recovery.allowed);
  }

  function unknown() {
    reset();
    status('UNKNOWN — no valid response was received, so it is not known whether the request was applied. Nothing is shown as success. Use Inspect (a read-only GET) or Retry with the same key.');
    controls(state.lastKey === null ? [] : state.lastRequest === null ? ['inspect'] : ['retry', 'inspect']);
  }

  async function call(method, route, body) {
    if (state.busy) return;
    setBusy(true);
    status('Waiting for the server…');
    try {
      const response = await fetch(route, { method, headers: body === null ? {} : { 'Content-Type': 'application/json' }, body: body === null ? undefined : body, cache: 'no-store' });
      const envelope = await response.json();
      const verdict = contract.validateResultEnvelope(envelope);
      if (!verdict.ok || (response.status >= 200 && response.status < 300) !== envelope.accepted) {
        reset();
        status(`REJECTED — the response is not a valid C042 result envelope (${verdict.ok ? 'HTTP status contradicts accepted' : verdict.problems.join(', ')}); nothing is shown as success.`);
        return;
      }
      if (envelope.idempotencyKey !== null) state.lastKey = envelope.idempotencyKey;
      if (envelope.validatedInput !== null && state.lastRequest === null) state.lastRequest = JSON.stringify(envelope.validatedInput);
      render(envelope, response.status);
      status(`${envelope.outcome.toUpperCase()} — ${envelope.recovery.reason}`);
    } catch {
      unknown();
    } finally {
      setBusy(false);
    }
  }

  function submit(text) {
    state.lastRequest = text;
    state.lastKey = keyOf(text);
    return call('POST', '/v1/steps', text);
  }

  async function act(name) {
    if (name === 'retry') return submit(state.lastRequest);
    if (name === 'correct-and-resubmit') {
      $('request').focus();
      status('Edit the request, then submit it again. A rejected request never used its key; a cancelled step needs a new key.');
      return undefined;
    }
    if (state.lastKey === null) {
      status('No valid idempotency key is known; edit the request and submit it first.');
      return undefined;
    }
    const route = `/v1/steps/${encodeURIComponent(state.lastKey)}`;
    return name === 'inspect' ? call('GET', route, null) : call('POST', `${route}/${name}`, null);
  }

  function inspectKey() {
    const key = $('key').value.trim();
    if (!contract.KEY_PATTERN.test(key)) {
      status('Enter a valid idempotency key: 8 to 64 letters, digits, dots, hyphens or underscores.');
      return undefined;
    }
    state.lastKey = key;
    state.lastRequest = null;
    return call('GET', `/v1/steps/${encodeURIComponent(key)}`, null);
  }

  const REQUIRED_CODES = ['DUPLICATE_FIELD', 'FORBIDDEN_FIELD', 'FIELD_OUT_OF_RANGE', 'IDEMPOTENCY_KEY_CONFLICT', 'UNSUPPORTED_STEP',
    'UNSUPPORTED_ACTION', 'ACTION_NOT_ALLOWED', 'STEP_IN_FLIGHT', 'STEP_CANCELLED', 'STEP_INTERRUPTED', 'JOURNAL_UNCERTAIN', 'CAPACITY_EXHAUSTED'];

  // The page re-checks the server's transcript: shapes, HTTP honesty, one effect per key, ledger totals and required evidence.
  function inspectTranscript(transcript) {
    const fail = (code, message) => ({ ok: false, code, message });
    const events = transcript && Array.isArray(transcript.events) ? transcript.events : [];
    if (!transcript || transcript.kind !== 'C042-server-transcript' || transcript.schemaVersion !== 1 ||
        transcript.scope !== contract.SCOPE || events.length === 0 || events.length > 200) {
      return fail('TRANSCRIPT_SHAPE', 'The transcript has the wrong kind, version, scope or size.');
    }
    const outcomes = {};
    const codes = new Set();
    const commits = new Map();
    const appliers = new Map();
    const ledger = new Map();
    let replays = 0;
    let aborts = 0;
    let exchanges = 0;
    for (const [index, event] of events.entries()) {
      if (event.n !== index + 1) return fail('SEQUENCE_GAP', `Event ${index + 1} is out of order or missing.`);
      if (!['exchange', 'abort', 'note'].includes(event.kind)) return fail('EVENT_SHAPE', `Event ${event.n} has an unknown kind.`);
      if (event.kind === 'abort') aborts += 1;
      if (event.kind !== 'exchange') continue;
      exchanges += 1;
      const answer = event.response;
      if (!answer || !Number.isInteger(answer.status) || !answer.body) return fail('EVENT_SHAPE', `Event ${event.n} has no response.`);
      const body = answer.body;
      if (body.kind === 'C042-lease-snapshot') {
        for (const [leaseId, lease] of Object.entries(body.leases)) {
          const expected = ledger.get(`${event.scenario}/${leaseId}`) ?? 0;
          if (lease.committed !== expected || lease.committed + lease.held > lease.capacity) return fail('LEDGER_MISMATCH', `Event ${event.n}: the ledger disagrees with the recorded effects.`);
        }
        continue;
      }
      const verdict = contract.validateResultEnvelope(body);
      if (!verdict.ok) return fail('ENVELOPE_INVALID', `Event ${event.n}: ${verdict.problems.join(', ')}.`);
      if ((answer.status >= 200 && answer.status < 300) !== body.accepted ||
          (!body.accepted && answer.status !== contract.ERRORS[body.error.code].status)) return fail('STATUS_MISMATCH', `Event ${event.n}: HTTP ${answer.status} contradicts the envelope.`);
      outcomes[body.outcome] = (outcomes[body.outcome] ?? 0) + 1;
      if (body.error) codes.add(body.error.code);
      if (body.outcome === 'succeeded' && body.replayed) replays += 1;
      const id = `${event.scenario}/${body.idempotencyKey}`;
      const commit = body.trail.find((item) => item.type === 'commit');
      if (commit && commits.has(id) && commits.get(id) !== commit.seq) return fail('SECOND_EFFECT', `Event ${event.n}: a second commit appeared for one key.`);
      if (commit && !commits.has(id)) {
        commits.set(id, commit.seq);
        const lease = `${event.scenario}/${body.effect.leaseId}`;
        ledger.set(lease, (ledger.get(lease) ?? 0) + body.effect.units);
      }
      if (body.effect.appliedByThisRequest) appliers.set(id, (appliers.get(id) ?? 0) + 1);
      if (appliers.get(id) > 1) return fail('SECOND_EFFECT', `Event ${event.n}: two requests claim to have applied one key.`);
    }
    const missing = [...contract.OUTCOMES.filter((name) => !outcomes[name]), ...REQUIRED_CODES.filter((code) => !codes.has(code))];
    if (missing.length || replays < 1 || aborts < 2) return fail('MISSING_EVIDENCE', `The transcript lacks required evidence: ${missing.join(', ') || 'replay or abort'}.`);
    return { ok: true, summary: { verified: true, exchanges, outcomes, replays, aborts, effects: commits.size, typedFailures: [...codes].sort() } };
  }

  function verifyTranscript(transcript) {
    try {
      return inspectTranscript(transcript);
    } catch {
      return { ok: false, code: 'TRANSCRIPT_SHAPE', message: 'The transcript could not be read as a closed C042 transcript.' };
    }
  }

  function row(event) {
    const exchange = event.kind === 'exchange';
    const body = exchange ? event.response.body : null;
    const result = body && body.kind === 'C042-step-result' ? `${body.outcome}${body.error ? ` · ${body.error.code}` : ''}` : exchange ? body.kind : event.kind;
    const request = exchange ? `${event.request.method} ${event.request.path}${event.request.body ? ` ${event.request.body}` : ''}` : '';
    const line = document.createElement('tr');
    line.className = `kind-${event.kind}`;
    line.replaceChildren(node('td', String(event.n)), node('td', event.scenario), node('td', request, 'request'),
      node('td', exchange ? String(event.response.status) : ''), node('td', result), node('td', event.note ?? ''));
    return line;
  }

  async function loadTranscript() {
    if (state.busy) return;
    setBusy(true);
    status('Loading the server-produced transcript…');
    $('events').replaceChildren();
    $('summary').textContent = 'No verified transcript.';
    try {
      const response = await fetch('/transcript.json', { cache: 'no-store' });
      if (!response.ok) {
        status(`REJECTED — HTTP_${response.status}: no transcript was observed.`);
        return;
      }
      const transcript = await response.json();
      const verdict = verifyTranscript(transcript);
      if (!verdict.ok) {
        status(`REJECTED — ${verdict.code}: ${verdict.message}`);
        return;
      }
      $('events').replaceChildren(...transcript.events.map(row));
      $('summary').textContent = JSON.stringify(verdict.summary, null, 2);
      status(`VERIFIED SERVER TRANSCRIPT — ${verdict.summary.exchanges} exchanges, ${verdict.summary.effects} effects, ${verdict.summary.replays} replays, ${verdict.summary.aborts} aborts and restarts. The POST actions were conducted by the server, not by this browser.`);
    } catch {
      status('REJECTED — TRANSCRIPT_UNAVAILABLE: no transcript was observed.');
    } finally {
      setBusy(false);
    }
  }

  $('preset').addEventListener('change', () => {
    $('request').value = Object.hasOwn(PRESETS, $('preset').value) ? PRESETS[$('preset').value] : $('request').value;
  });
  $('step-form').addEventListener('submit', (event) => {
    event.preventDefault();
    return submit($('request').value);
  });
  $('inspect').addEventListener('click', inspectKey);
  $('load').addEventListener('click', loadTranscript);
  $('request').value = PRESETS.valid;
  reset();
  for (const id of ['submit', 'inspect', 'load']) $(id).disabled = false;
  Object.defineProperty(globalThis, 'C042Page', { value: Object.freeze({ verifyTranscript }) });
}());
