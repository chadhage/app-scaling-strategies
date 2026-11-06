(function () {
  'use strict';

  const contract = globalThis.C043Contract;
  const verify = globalThis.C043Verify;
  const envelope = globalThis.C043Envelope;
  const $ = (id) => document.getElementById(id);
  const step = (n, extra = {}) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: `example-step-${n}`, leaseId: 'synthetic-lease-001', units: 5, ...extra });
  const preset = (extra = {}) => ({
    schemaVersion: 1, preset: 'example-sequence', idempotencyKey: 'example-run-0001', bounds: { maxSteps: 4, maxDurationMs: 1000, maxUnits: 40 }, steps: [step(1), step(2), step(3)], ...extra,
  });
  const text = (value) => JSON.stringify(value);
  const EXAMPLES = {
    'example:valid': ['A valid three-step preset', () => text(preset())],
    'example:conflict': ['The same key with another preset (conflict)', () => text(preset({ steps: [step(1), step(2, { units: 6 }), step(3)] }))],
    'example:duplicate': ['A duplicated JSON key', () => text(preset()).replace('"preset":"example-sequence"', '"preset":"example-sequence","preset":"other"')],
    'example:prototype': ['A __proto__ key', () => text(preset()).replace('{"schemaVersion":1', '{"__proto__":{"x":1},"schemaVersion":1')],
    'example:version': ['An unknown preset version', () => text(preset({ schemaVersion: 2 }))],
    'example:many': ['More steps than allowed', () => text(preset({ bounds: { maxSteps: 8, maxDurationMs: 1000, maxUnits: 80 }, steps: Array.from({ length: 9 }, (_, index) => step(index + 1, { units: 1 })) }))],
    'example:last': ['An invalid step in the last position', () => text(preset({ steps: [step(1), step(2), step(3, { units: 11 })] }))],
    'example:twin': ['Two steps with one key', () => text(preset({ steps: [step(1), step(1), step(3)] }))],
    'example:units': ['Over the declared unit bound', () => text(preset({ bounds: { maxSteps: 4, maxDurationMs: 1000, maxUnits: 14 } }))],
  };
  const STATE_WORDS = {
    none: 'no run was created', running: 'RUNNING', completed: 'COMPLETED', stopped: 'STOPPED at a step that did not succeed', bounded: 'STOPPED by a bound', cancelled: 'CANCELLED', interrupted: 'INTERRUPTED (not finished)',
  };
  const STATUS_WORDS = {
    succeeded: 'succeeded', replayed: 'already applied (replayed, one effect)', failed: 'did not succeed', unknown: 'unconfirmed', interrupted: 'interrupted', cancelled: 'cancelled', running: 'in flight', 'not-run': 'not run',
  };
  const BOUND_WORDS = { maxSteps: 'the maximum number of steps', maxDurationMs: 'the maximum duration (ms)', maxUnits: 'the maximum number of synthetic units' };
  const STATUS_VERBS = { failed: 'did not succeed', unknown: 'is unconfirmed', interrupted: 'is interrupted', cancelled: 'is cancelled', running: 'is in flight' };
  const state = { busy: false, lastRequest: null, lastKey: null, catalog: [] };
  let watcher = null;

  function node(tag, content, className) {
    const element = document.createElement(tag);
    element.textContent = content;
    if (className) element.className = className;
    return element;
  }

  const status = (message) => { $('status').textContent = message; };
  const list = (id, items) => $(id).replaceChildren(...items.map((item) => node('li', item)));
  const parse = (source) => { try { return JSON.parse(source); } catch { return null; } };
  const keyOf = (source) => { const value = parse(source); return value && typeof value.idempotencyKey === 'string' && contract.c42.KEY_PATTERN.test(value.idempotencyKey) ? value.idempotencyKey : null; };

  function showProgress(steps) {
    $('progress').replaceChildren(...steps.map((item) => node('li', `Step ${item.index} · ${item.key} · ${item.units} units on ${item.leaseId} · ${STATUS_WORDS[item.status]}${item.code ? ` (${item.code})` : ''}`, `status-${item.status}`)));
  }

  function reset() {
    $('progress').replaceChildren();
    for (const id of ['result', 'listing-ran', 'listing-notrun', 'listing-effects', 'did-not', 'details', 'trail']) $(id).replaceChildren();
    $('recovery').textContent = 'No result yet.';
  }

  function setBusy(busy) {
    state.busy = busy;
    for (const id of ['submit', 'inspect', 'load']) $(id).disabled = busy;
  }

  // Only the controls the answer offers are drawn; each one performs a real request or edit, nothing else.
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

  // Every word below is derived from the validated FACTS (state, steps, bound, details); no server sentence is printed.
  function headline(value) {
    const total = value.steps.length;
    const standing = `${value.effects.length} effect(s) stand (${value.usage.units} units); nothing was undone`;
    const stopped = value.steps.find((item) => !contract.SUCCESS_STATUSES.includes(item.status) && item.status !== 'not-run');
    if (value.error && !Object.hasOwn(contract.RUN_CODE_STATE, value.error.code)) {
      const where = value.run.state === 'none' ? 'nothing was run and nothing was written' : `the run under this key is ${STATE_WORDS[value.run.state]}; ${standing}`;
      return `${value.outcome.toUpperCase()} — ${value.error.code}; ${where}.`;
    }
    if (value.run.state === 'completed') return `COMPLETED — all ${total} steps succeeded within the bounds; ${standing}.`;
    if (value.run.state === 'none' && value.bound) return `BOUND EXCEEDED — ${BOUND_WORDS[value.bound.name]} is ${value.bound.limit} but the preset declares ${value.bound.observed}; nothing was run or written.`;
    if (value.bound) return `BOUND EXCEEDED — ${BOUND_WORDS[value.bound.name]} is ${value.bound.limit} but ${value.bound.observed} was used; ${value.notRun.length} step(s) were not run; ${standing}.`;
    const where = stopped ? `step ${stopped.index} of ${total} ${STATUS_VERBS[stopped.status]}${stopped.code ? ` (${stopped.code})` : ''}` : `${value.notRun.length} of ${total} steps were not run`;
    return `${STATE_WORDS[value.run.state]} — ${where}; ${value.notRun.length} step(s) were not run; ${standing}.`;
  }

  function render(value, httpStatus) {
    const bound = value.bound ? `${value.bound.name}: limit ${value.bound.limit}, observed ${value.bound.observed}` : 'none';
    const rows = [
      ['HTTP status', String(httpStatus)], ['Request', value.action], ['Answer', `${value.outcome} (${value.classification})`], ['Run state', STATE_WORDS[value.run.state]],
      ['Accepted', String(value.accepted)], ['Replayed', String(value.replayed)], ['Terminal', String(value.terminal)],
      ['Steps that ran', String(value.ran.length)], ['Steps not run', String(value.notRun.length)], ['Effects that stand', `${value.effects.length} (${value.usage.units} units)`],
      ['Elapsed (injected clock)', `${value.usage.elapsedMs} ms`], ['Bound exceeded', bound],
      ['Typed code', value.error ? `${value.error.code} (${value.error.group})` : 'none'], ['Why', value.error ? contract.ERRORS[value.error.code].message : contract.STATE_REASONS[value.run.state]],
      ['Attempts', String(value.attempts)],
    ];
    $('result').replaceChildren(...rows.flatMap(([name, content]) => [node('dt', name), node('dd', content)]));
    showProgress(value.steps);
    list('listing-ran', value.ran.map((index) => `Step ${index} (${value.steps[index - 1].key})`));
    list('listing-notrun', value.notRun.map((index) => `Step ${index} (${value.steps[index - 1].key})`));
    list('listing-effects', value.effects.map((item) => `Step ${item.index}: ${item.units} units on ${item.leaseId}, reserved after ${item.reservedAfter}`));
    list('did-not', value.didNot.map((item) => `${item.code}: ${contract.DIDNOT[item.code]}`));
    list('details', (value.error ? value.error.details : []).map((item) => `${item.path}: ${item.code}`));
    list('trail', value.trail.map((item) => `#${item.seq} ${item.type}`));
    controls(value.recovery.allowed);
  }

  function unknown() {
    reset();
    status('UNKNOWN — no valid response was received, so it is not known whether the request was applied. Nothing is shown as success. Use Inspect (a read-only GET) or Retry with the same key.');
    controls(state.lastKey === null ? [] : state.lastRequest === null ? ['inspect'] : ['retry', 'inspect']);
  }

  const stopWatching = () => { if (watcher !== null) { clearTimeout(watcher); watcher = null; } };

  // While a preset runs, a read-only GET shows the steps acknowledged so far (every answer is validated like any other).
  function watch(key) {
    stopWatching();
    if (typeof setTimeout !== 'function') return;
    const tick = async () => {
      try {
        const response = await fetch(`/v1/presets/${encodeURIComponent(key)}`, { cache: 'no-store' });
        const value = await response.json();
        if (watcher !== null && verify.checkAnswer(response.status, value, undefined).ok && value.action === 'inspect') showProgress(value.steps);
      } catch { /* a failed progress read is not an answer; the final answer decides */ }
      if (watcher !== null) watcher = setTimeout(tick, 250);
    };
    watcher = setTimeout(tick, 250);
  }

  async function call(method, route, body, sent) {
    if (state.busy) return;
    setBusy(true);
    status('Waiting for the server…');
    if (method === 'POST' && body !== null) watch(state.lastKey);
    try {
      const response = await fetch(route, { method, headers: body === null ? {} : { 'Content-Type': 'application/json' }, body: body === null ? undefined : body, cache: 'no-store' });
      const value = await response.json();
      stopWatching();
      const verdict = verify.checkAnswer(response.status, value, sent);
      if (!verdict.ok) {
        reset();
        status(`REJECTED — the response is not a valid C043 result (${verdict.problems.join(', ')}); nothing is shown as success.`);
        return;
      }
      if (value.idempotencyKey !== null) state.lastKey = value.idempotencyKey;
      render(value, response.status);
      status(headline(value));
    } catch {
      stopWatching();
      unknown();
    } finally {
      setBusy(false);
    }
  }

  function submit(source) {
    state.lastRequest = source;
    state.lastKey = keyOf(source);
    return call('POST', '/v1/presets', source, parse(source));
  }

  async function act(name) {
    if (name === 'retry') return submit(state.lastRequest);
    if (name === 'correct-and-resubmit') {
      $('request').focus();
      status('Edit the preset, then run it again. A stopped, bounded or cancelled preset needs a new key; steps already applied replay with one effect.');
      return undefined;
    }
    if (state.lastKey === null) {
      status('No valid preset key is known; edit the preset and run it first.');
      return undefined;
    }
    const route = `/v1/presets/${encodeURIComponent(state.lastKey)}`;
    return name === 'inspect' ? call('GET', route, null) : call('POST', `${route}/${name}`, null);
  }

  function inspectKey() {
    const key = $('key').value.trim();
    if (!contract.c42.KEY_PATTERN.test(key)) {
      status('Enter a valid preset key: 8 to 64 letters, digits, dots, hyphens or underscores.');
      return undefined;
    }
    state.lastKey = key;
    state.lastRequest = null;
    return call('GET', `/v1/presets/${encodeURIComponent(key)}`, null);
  }

  function fillSelect() {
    const options = [...state.catalog.map((item, index) => [`catalog:${index}`, `Declared preset: ${item.preset}`]), ...Object.entries(EXAMPLES).map(([value, [label]]) => [value, label])];
    $('preset').replaceChildren(...options.map(([value, label]) => { const option = node('option', label); option.value = value; return option; }));
  }

  function choose() {
    const value = $('preset').value;
    const chosen = value.startsWith('catalog:') ? state.catalog[Number(value.slice(8))] : undefined;
    if (chosen !== undefined) $('request').value = text(chosen);
    else if (Object.hasOwn(EXAMPLES, value)) $('request').value = EXAMPLES[value][1]();
  }

  async function loadCatalog() {
    try {
      const response = await fetch('/v1/presets', { cache: 'no-store' });
      const value = await response.json();
      if (!response.ok || !envelope.validateCatalog(value).ok) throw new Error('invalid catalog');
      state.catalog = value.presets;
      $('catalog-status').textContent = `${value.presets.length} declared presets loaded and validated.`;
    } catch {
      state.catalog = [];
      $('catalog-status').textContent = 'REJECTED — the declared presets could not be loaded or did not validate; only the built-in examples are offered.';
    }
    fillSelect();
    choose();
  }

  function row(event) {
    const exchange = event.kind === 'exchange';
    const body = exchange ? event.response.body : null;
    const result = body && body.kind === 'C043-preset-result' ? `${body.outcome}${body.error ? ` · ${body.error.code}` : ''}` : exchange ? body.kind : event.kind;
    const request = exchange ? `${event.request.method} ${event.request.path}${event.request.body ? ` ${event.request.body}` : ''}` : '';
    const tr = document.createElement('tr');
    tr.className = `kind-${event.kind}`;
    const cells = [String(event.n), event.scenario ?? '', request, exchange ? String(event.response.status) : '', result, event.note ?? ''];
    tr.replaceChildren(...cells.map((cell, index) => node('td', cell, index === 2 ? 'request' : '')));
    return tr;
  }

  async function loadTranscript() {
    if (state.busy) return;
    setBusy(true);
    status('Loading the server-produced transcript…');
    try {
      const response = await fetch('/transcript.json', { cache: 'no-store' });
      const transcript = await response.json();
      const verdict = response.ok ? verify.verifyTranscript(transcript) : { ok: false, code: 'TRANSCRIPT_UNAVAILABLE', message: 'The server could not produce the transcript.' };
      if (!verdict.ok) {
        $('summary').textContent = `REJECTED — ${verdict.code}: ${verdict.message}`;
        $('events').replaceChildren();
        status('REJECTED — the transcript did not verify; nothing is shown as observed.');
        return;
      }
      $('summary').textContent = `VERIFIED SERVER TRANSCRIPT\n${JSON.stringify(verdict.summary, null, 2)}`;
      $('events').replaceChildren(...transcript.events.map(row));
      status(`VERIFIED — ${verdict.summary.exchanges} exchanges, one effect per step, ledger totals reconciled.`);
    } catch {
      $('summary').textContent = 'REJECTED — the transcript could not be loaded.';
      $('events').replaceChildren();
      status('UNKNOWN — the transcript could not be loaded; nothing is shown as observed.');
    } finally {
      setBusy(false);
    }
  }

  $('run-form').addEventListener('submit', (event) => { event.preventDefault(); return submit($('request').value); });
  $('preset').addEventListener('change', choose);
  $('inspect').addEventListener('click', inspectKey);
  $('load').addEventListener('click', loadTranscript);
  reset();
  fillSelect();
  choose();
  for (const id of ['submit', 'inspect', 'load']) $(id).disabled = false;
  loadCatalog();
}());
