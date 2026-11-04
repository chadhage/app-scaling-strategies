'use strict';

// Runs the unchanged browser page code (app.js) under Node with a stubbed document, so the page is
// measured by Node coverage and its rendered behavior is asserted without a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { root } = require('./provenance.cjs');
const manifest = require('..\\manifest.json');
const types = require('..\\errors.js');
const recovery = require('..\\recovery.js');
const bank = require(path.join(root, manifest.historicalObservations));
const appPath = path.join(root, 'app.js');
const pinned = Buffer.from(manifest.historicalObservationsCanonicalSha256, 'hex');
const waiting = 'WAITING FOR INITIALIZE';

class Element {
  constructor(tagName, document) {
    this.tagName = tagName;
    this.document = document;
    this.textContent = '';
    this.disabled = false;
    this.open = false;
    this.children = [];
    this.handlers = {};
  }

  append(...nodes) { this.children.push(...nodes); }
  replaceChildren() { this.children = []; }
  addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
  focus() { this.document.activeElement = this; }
  trigger(type) { for (const handler of this.handlers[type] || []) handler({ type }); }
  get innerHTML() { throw new Error('HTML parsing is forbidden in the page.'); }
  set innerHTML(value) { throw new Error('HTML parsing is forbidden in the page.'); }
}

class Select extends Element {
  #options = [];
  #index = -1;

  get options() { return this.#options; }
  add(option) {
    this.#options.push(option);
    if (this.#index < 0) this.#index = 0;
  }
  replaceChildren() {
    this.#options = [];
    this.#index = -1;
  }
  get value() { return this.#index < 0 ? '' : this.#options[this.#index].value; }
  set value(value) { this.#index = this.#options.findIndex((option) => option.value === value); }
}

function makeDocument() {
  const document = { activeElement: null, elements: new Map() };
  for (const id of ['case-id', 'action-id']) document.elements.set(id, new Select('select', document));
  for (const id of ['inspect', 'perform', 'reset', 'status', 'outcome', 'error-code', 'error-type', 'error-reason',
    'pending-run', 'pending-epoch', 'pending-step', 'inspection-count', 'authority', 'prior-ack', 'last-inspection',
    'history-count', 'history', 'canonical-state']) document.elements.set(id, new Element('element', document));
  document.elements.get('status').textContent = waiting;
  document.canonicalDetails = new Element('details', document);
  document.getElementById = (id) => {
    const element = document.elements.get(id);
    assert.ok(element, `The page asked for an unknown element: ${id}`);
    return element;
  };
  document.createElement = (tagName) => new Element(tagName, document);
  document.querySelectorAll = (selector) => {
    assert.equal(selector, 'details');
    const found = [document.canonicalDetails];
    for (const item of document.getElementById('history').children) {
      found.push(...item.children.filter((child) => child.tagName === 'details'));
    }
    return found;
  };
  return document;
}

function digestOf(bytes) { return Uint8Array.from(bytes).buffer; }

async function withPage(options, run) {
  const { mutate = null, bypassDigest = false, globals = {} } = options;
  const document = makeDocument();
  const bankCopy = structuredClone(bank);
  if (mutate) mutate(bankCopy);
  const installed = { document, Option: class Option { constructor(text, value) { this.text = text; this.value = value; } },
    C019Errors: types, C019Recovery: recovery, C019CapturedObservations: bankCopy, ...globals };
  if (bypassDigest) installed.crypto = { subtle: { digest: async () => digestOf(pinned) } };
  const saved = new Map();
  for (const [name, value] of Object.entries(installed)) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  try {
    delete require.cache[appPath];
    require(appPath);
    const status = document.getElementById('status');
    for (let attempt = 0; attempt < 3000 && status.textContent === waiting; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    assert.notEqual(status.textContent, waiting, 'The page initialization must settle.');
    return await run(document);
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    delete require.cache[appPath];
  }
}

const text = (document, id) => document.getElementById(id).textContent;
const state = (document) => JSON.parse(text(document, 'canonical-state'));
const everyText = (document) => [...document.elements.values()].map((element) => element.textContent).join('\n');
function choose(document, id) {
  const select = document.getElementById('case-id');
  select.value = id;
  select.trigger('change');
}
function inspect(document, id) {
  choose(document, id);
  document.getElementById('inspect').trigger('click');
}
function perform(document, action, label = 'Injected step') {
  const select = document.getElementById('action-id');
  if (!select.options.some((option) => option.value === action)) select.add(new Option(label, action));
  select.value = action;
  document.getElementById('perform').trigger('click');
}
const unknownText = {
  run: /^UNKNOWN — no run ID inferred or rejected input retained$/,
  epoch: /^UNKNOWN — not inferred from an earlier acknowledgment$/,
  step: /^UNKNOWN — not inferred from an unacknowledged candidate$/,
};
const successShaped = /"recoveryConfirmed":true|"writesAuthorized":true|Recovery confirmed: true|Write authorized: true|\b(?:recovered|repaired|restored)\b/i;

function assertRejectedPage(document, untrusted = []) {
  for (const id of ['case-id', 'inspect', 'action-id', 'perform', 'reset']) {
    assert.equal(document.getElementById(id).disabled, true, `${id} must stay disabled`);
    assert.deepEqual(document.getElementById(id).handlers, {}, `${id} must never receive a handler`);
  }
  assert.match(text(document, 'status'), /^REJECTED INVALID_BUNDLE — Historical observations or their integrity could not be established\. No live state or recovery is inferred\.$/);
  assert.equal(text(document, 'outcome'), 'rejected');
  assert.equal(text(document, 'canonical-state'), '{"recoveryConfirmed":false,"status":"rejected","writesAuthorized":false}');
  for (const value of untrusted) assert.equal(everyText(document).includes(value), false, 'Untrusted bundle values are never rendered.');
  assert.doesNotMatch(everyText(document), successShaped);
}

test('page initializes from the pinned genuine bank into an uninspected, closed, read-only state', async () => {
  await withPage({}, (document) => {
    const select = document.getElementById('case-id');
    assert.deepEqual(select.options.map((option) => option.value), bank.cases.map((entry) => entry.id));
    assert.equal(select.options.length, 13);
    assert.equal(select.value, 'missing-state');
    for (const id of ['case-id', 'inspect', 'reset']) assert.equal(document.getElementById(id).disabled, false);
    assert.equal(document.getElementById('perform').disabled, true);
    assert.equal(document.getElementById('action-id').disabled, true);
    assert.deepEqual(document.getElementById('action-id').options.map((option) => option.text), ['No allowed actions']);
    assert.match(text(document, 'status'), /^NO_OBSERVATION — No failure inspected\. No live storage state, consent, or recovery is inferred\.$/);
    assert.equal(text(document, 'outcome'), 'uninspected');
    assert.equal(text(document, 'error-code'), 'No typed error inspected');
    assert.equal(text(document, 'error-type'), 'Unknown');
    assert.equal(text(document, 'error-reason'), 'No failure has been inspected.');
    assert.match(text(document, 'pending-run'), unknownText.run);
    assert.match(text(document, 'pending-epoch'), unknownText.epoch);
    assert.match(text(document, 'pending-step'), unknownText.step);
    assert.equal(text(document, 'inspection-count'), '0 / 3');
    assert.equal(text(document, 'history-count'), '0 / 48');
    assert.equal(text(document, 'prior-ack'), 'No earlier acknowledgment observed.');
    assert.equal(text(document, 'last-inspection'), 'No read-only reinspection recorded.');
    assert.equal(text(document, 'authority'), 'Recovery confirmed: false. Write authorized: false. Operator review needed: false. Need acknowledged: false. Operator review not performed.');
    assert.equal(text(document, 'canonical-state'), types.canonical(new recovery.RecoveryConsole().state));
    assert.equal(document.getElementById('history').children.length, 0);
  });
});

test('all 13 genuine captured failures render their exact typed code, unknown context and no success', async () => {
  await withPage({}, (document) => {
    for (const entry of bank.cases) {
      const { failure } = entry;
      const code = failure.error.code;
      inspect(document, entry.id);
      assert.equal(text(document, 'error-code'), `C015.${code}`);
      assert.equal(text(document, 'error-type'), 'C015FixtureError');
      assert.equal(text(document, 'error-reason'), types.map[code].reason);
      assert.equal(text(document, 'outcome'), code === 'HOLD_UNOBSERVED' ? 'held-unobserved' : 'failed');
      if (failure.context.runId === null) assert.match(text(document, 'pending-run'), unknownText.run);
      else assert.equal(text(document, 'pending-run'), failure.context.runId);
      if (failure.context.epoch === null) assert.match(text(document, 'pending-epoch'), unknownText.epoch);
      else assert.equal(text(document, 'pending-epoch'), String(failure.context.epoch));
      if (failure.context.pendingStep === null) assert.match(text(document, 'pending-step'), unknownText.step);
      else assert.equal(text(document, 'pending-step'), failure.context.pendingStep);
      assert.equal(text(document, 'prior-ack'), failure.priorAcknowledgment === null
        ? 'No earlier acknowledgment observed.' : JSON.stringify(failure.priorAcknowledgment, null, 2));
      assert.equal(text(document, 'inspection-count'), '0 / 3');
      assert.equal(text(document, 'authority'), 'Recovery confirmed: false. Write authorized: false. Operator review needed: true. Need acknowledged: false. Operator review not performed.');
      const expectedActions = types.map[code].actions.filter((action) => !(action === 'reinspect' && failure.context.runId === null));
      const select = document.getElementById('action-id');
      assert.deepEqual(select.options.map((option) => option.value), expectedActions);
      assert.deepEqual(select.options.map((option) => option.text), expectedActions.map((action) => types.actions[action].label));
      assert.equal(select.disabled, false);
      assert.equal(document.getElementById('perform').disabled, false);
      const current = state(document);
      assert.deepEqual(current.failure, failure);
      assert.equal(current.recoveryConfirmed, false);
      assert.equal(current.writesAuthorized, false);
      assert.ok(['failed', 'held-unobserved'].includes(current.status));
      assert.doesNotMatch(everyText(document), successShaped);
    }
  });
});

test('actions stay bounded read-only steps: three replays, then rejected reads and forbidden actions append history', async () => {
  await withPage({}, (document) => {
    inspect(document, 'held-published');
    const held = state(document);
    assert.equal(held.status, 'held-unobserved');
    const actionSelect = document.getElementById('action-id');
    for (let reads = 1; reads <= 3; reads++) {
      assert.equal(actionSelect.value, 'reinspect');
      perform(document, 'reinspect');
      const replay = state(document);
      assert.equal(replay.notification.code, 'HISTORICAL_REINSPECTION');
      assert.equal(replay.inspectionCount, reads);
      assert.deepEqual(replay.failure, held.failure);
      assert.equal(text(document, 'inspection-count'), `${reads} / 3`);
    }
    assert.deepEqual(actionSelect.options.map((option) => option.value), ['confirm-operator-review', 'stop']);
    assert.equal(JSON.parse(text(document, 'last-inspection')).error.code, 'HOLD_UNOBSERVED');
    const beforeFourth = state(document).history.length;
    perform(document, 'reinspect', 'Injected fourth read');
    assert.equal(state(document).notification.code, 'READ_LIMIT');
    assert.equal(state(document).inspectionCount, 3);
    assert.equal(state(document).history.length, beforeFourth + 1);
    perform(document, 'reclaim-marker', 'Untrusted action');
    assert.equal(state(document).notification.code, 'ACTION_NOT_ALLOWED');
    assert.equal(everyText(document).includes('reclaim-marker'), false, 'Rejected action text is not retained or rendered.');
    assert.equal(actionSelect.options.some((option) => option.value === 'reclaim-marker'), false);
    perform(document, 'confirm-operator-review');
    const reviewed = state(document);
    assert.equal(reviewed.notification.code, 'REVIEW_NEEDED_CONFIRMED');
    assert.equal(reviewed.operatorReviewAcknowledged, true);
    assert.equal(reviewed.recoveryConfirmed, false);
    assert.match(text(document, 'authority'), /Operator review needed: true\. Need acknowledged: true\. Operator review not performed\.$/);
    assert.deepEqual(actionSelect.options.map((option) => option.value), ['stop']);
    perform(document, 'stop');
    const stopped = state(document);
    assert.equal(stopped.status, 'stopped');
    assert.deepEqual(stopped.failure, held.failure);
    assert.deepEqual(stopped.history.slice(0, reviewed.history.length), reviewed.history);
    assert.equal(text(document, 'outcome'), 'stopped');
    assert.deepEqual(actionSelect.options.map((option) => option.text), ['No allowed actions']);
    assert.equal(actionSelect.disabled, true);
    assert.equal(document.getElementById('perform').disabled, true);
    document.getElementById('inspect').trigger('click');
    assert.equal(state(document).notification.code, 'STOPPED');
    assert.equal(state(document).status, 'stopped');
    assert.doesNotMatch(everyText(document), successShaped);
  });
});

test('unknown or changed selections reject visibly without keeping the input or losing the observed failure', async () => {
  await withPage({}, (document) => {
    const select = document.getElementById('case-id');
    select.add(new Option('Untrusted fixture', 'untrusted-synthetic-marker'));
    select.value = 'untrusted-synthetic-marker';
    select.trigger('change');
    let current = state(document);
    assert.equal(current.notification.code, 'UNKNOWN_SELECTION');
    assert.equal(current.status, 'rejected');
    assert.equal(current.failure, null);
    assert.equal(text(document, 'outcome'), 'rejected');
    assert.equal(select.value, '');
    assert.equal(select.options[0].text, 'No valid selection — choose a historical fixture');
    assert.equal(everyText(document).includes('untrusted-synthetic-marker'), false);
    document.getElementById('inspect').trigger('click');
    assert.equal(state(document).notification.code, 'UNKNOWN_SELECTION');
    assert.equal(state(document).history.length, 2);
    inspect(document, 'stale-epoch');
    const observed = state(document);
    assert.equal(observed.failure.error.code, 'STALE_EPOCH');
    choose(document, 'held-partial');
    current = state(document);
    assert.equal(current.notification.code, 'SELECTION_CHANGED');
    assert.deepEqual(current.failure, observed.failure);
    assert.equal(text(document, 'error-code'), 'C015.STALE_EPOCH');
    assert.equal(select.value, 'held-partial');
    select.add(new Option('Untrusted fixture', 'untrusted-synthetic-marker'));
    select.value = 'untrusted-synthetic-marker';
    select.trigger('change');
    assert.equal(state(document).notification.code, 'UNKNOWN_SELECTION');
    assert.deepEqual(state(document).failure, observed.failure);
    assert.equal(everyText(document).includes('untrusted-synthetic-marker'), false);
  });
});

test('history entries are inspectable details and reset changes the presentation and focus only', async () => {
  await withPage({}, (document) => {
    inspect(document, 'ack-mismatch');
    perform(document, 'reinspect');
    perform(document, 'forbidden-write', 'Untrusted action');
    const before = state(document);
    const items = document.getElementById('history').children;
    assert.equal(items.length, before.history.length);
    for (const [position, item] of items.entries()) {
      const entry = before.history[position];
      const [details] = item.children;
      assert.equal(item.tagName, 'li');
      assert.equal(details.tagName, 'details');
      const [summary, data] = details.children;
      assert.equal(summary.textContent, `${entry.sequence}: ${entry.code} — ${entry.accepted ? 'allowed presentation step only' : 'rejected'} — ${entry.failure === null ? 'no observed failure' : entry.failure.error.code}`);
      assert.deepEqual(JSON.parse(data.textContent), entry);
      assert.ok(data.textContent.includes('\n  "sequence": '), 'The entry details are readable indented JSON.');
      details.open = true;
    }
    document.canonicalDetails.open = true;
    document.getElementById('reset').trigger('click');
    const after = state(document);
    assert.equal(after.notification.code, 'VIEW_RESET');
    assert.deepEqual(after.failure, before.failure);
    assert.equal(after.inspectionCount, before.inspectionCount);
    assert.equal(after.operatorReviewAcknowledged, before.operatorReviewAcknowledged);
    assert.deepEqual(after.history.slice(0, before.history.length), before.history);
    assert.equal(after.history.length, before.history.length + 1);
    assert.equal(document.activeElement, document.getElementById('case-id'));
    assert.equal(document.getElementById('case-id').value, 'missing-state');
    assert.equal(document.querySelectorAll('details').some((details) => details.open), false);
    assert.equal(text(document, 'error-code'), 'C015.ACKNOWLEDGMENT_MISMATCH');
  });
});

test('history stops at its 48-entry ceiling without evicting evidence and offers no further action', async () => {
  await withPage({}, (document) => {
    choose(document, 'missing-state');
    for (let observation = 1; observation <= 48; observation++) document.getElementById('inspect').trigger('click');
    const ceiling = state(document);
    assert.equal(ceiling.history.length, 48);
    assert.equal(ceiling.history.at(-1).code, 'HISTORY_LIMIT');
    assert.equal(ceiling.history.at(-2).code, 'FAILURE_OBSERVED');
    assert.equal(ceiling.history[0].sequence, 1);
    assert.equal(ceiling.history[0].code, 'SELECTION_CHANGED');
    assert.equal(ceiling.status, 'stopped');
    assert.equal(ceiling.failure.error.code, 'STATE_MISSING');
    assert.equal(text(document, 'history-count'), '48 / 48');
    assert.equal(document.getElementById('history').children.length, 48);
    assert.equal(document.getElementById('perform').disabled, true);
    document.getElementById('inspect').trigger('click');
    assert.deepEqual(state(document), ceiling);
    assert.equal(text(document, 'history-count'), '48 / 48');
  });
});

const tampered = {
  'unsupported schema version': (copy) => { copy.schemaVersion = 2; },
  'actual read-only mode claim': (copy) => { copy.mode = 'actual-read-only'; },
  'foreign capture id': (copy) => { copy.captureId = 'fixtures-00000000-0000-0000-0000-000000000000'; },
  'live filesystem claim': (copy) => { copy.filesystemInspectionNow = true; },
  'recovery claim': (copy) => { copy.recoveryConfirmed = true; },
  'malformed capture time': (copy) => { copy.capturedAtUtc = '2026-11-04'; },
  'cases that are not an array': (copy) => { copy.cases = {}; },
  'unlisted extra field': (copy) => { copy.untrusted = 'UNTRUSTED_EXTRA_FIELD'; },
  'changed typed code under the digest pin': (copy) => { copy.cases[0].failure.error.code = 'UNTRUSTED_FUTURE_CODE'; },
  'dropped case under the digest pin': (copy) => { copy.cases.pop(); },
};
for (const [name, mutate] of Object.entries(tampered)) {
  test(`untrusted bundle is rejected with every control disabled: ${name}`, async () => {
    await withPage({ mutate }, (document) => assertRejectedPage(document,
      ['UNTRUSTED_FUTURE_CODE', 'UNTRUSTED_EXTRA_FIELD', 'actual-read-only']));
  });
}

const closedChecks = {
  'an unknown case id': (copy) => { copy.cases[0].id = 'unknown-case'; },
  'a relabeled case': (copy) => { copy.cases[0].label = 'UNTRUSTED relabeled case'; },
  'a duplicate case': (copy) => { copy.cases[1] = structuredClone(copy.cases[0]); },
  'a case with an extra field': (copy) => { copy.cases[0].untrusted = 'UNTRUSTED_CASE_FIELD'; },
  'a non-genuine failure record': (copy) => { copy.cases[0].failure.kind = 'forged-success'; },
  'a valid code that belongs to another case': (copy) => { copy.cases[0].failure.error.code = 'STALE_EPOCH'; },
  'a changed case count': (copy) => { copy.cases.pop(); },
};
for (const [name, mutate] of Object.entries(closedChecks)) {
  test(`per-case closed checks still reject ${name} even if the digest pin were bypassed`, async () => {
    await withPage({ mutate, bypassDigest: true }, (document) => assertRejectedPage(document,
      ['UNTRUSTED relabeled case', 'UNTRUSTED_CASE_FIELD', 'forged-success']));
  });
}

test('missing closed dependencies or a missing crypto digest never enable the page', async () => {
  for (const globals of [{ C019Errors: undefined }, { C019Recovery: undefined },
    { C019CapturedObservations: undefined }, { crypto: undefined }]) {
    await withPage({ globals }, (document) => assertRejectedPage(document));
  }
});
