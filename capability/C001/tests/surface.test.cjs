'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const snapshot = require('../approved-contract.js');
const guard = require('../contract-guard.js');

const source = readFileSync(resolve(__dirname, '..', 'contract-page.js'), 'utf8');

async function surface(artifact = snapshot, validator = guard) {
  const elements = new Map();
  const document = {
    activeElement: null,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, this.createElement(id));
      return elements.get(id);
    },
    createElement() {
      return {
        disabled: true,
        textContent: '',
        value: 'local.probe',
        dataset: {},
        children: [],
        listeners: {},
        focusCalls: 0,
        append(...items) { this.children.push(...items); },
        replaceChildren(...items) { this.children = items; },
        addEventListener(event, callback) { this.listeners[event] = callback; },
        focus() { document.activeElement = this; this.focusCalls++; }
      };
    }
  };
  await vm.runInNewContext(source, {
    document,
    C001ApprovedContract: artifact,
    C001ContractGuard: validator
  });
  return { document, get: (id) => document.getElementById(id) };
}

test('surface unit: missing snapshot or validator keeps controls denied and disabled', async () => {
  for (const [artifact, validator] of [[null, guard], [snapshot, null]]) {
    const view = await surface(artifact, validator);
    assert.equal(view.get('action').disabled, true);
    assert.equal(view.get('probe').disabled, true);
    assert.match(view.get('result').textContent, /DENIED.*unavailable/);
    assert.equal(JSON.parse(view.get('decision-json').textContent).allowed, false);
    assert.equal(view.get('approved-choices').children.length, 0);
  }
});

test('surface unit: integrity rejection never renders untrusted choices or enables probes', async () => {
  const changed = structuredClone(snapshot);
  changed.approval.runtime = 'visitor runtime';
  const view = await surface(changed, guard);
  assert.equal(view.get('probe').disabled, true);
  assert.match(view.get('result').textContent, /APPROVAL_DRIFT/);
  assert.equal(view.get('approved-choices').children.length, 0);
});

test('surface unit: valid contract renders read-only rows and a ready status', async () => {
  const view = await surface();
  assert.equal(view.get('action').disabled, false);
  assert.equal(view.get('probe').disabled, false);
  assert.match(view.get('result').textContent, /^READY/);
  assert.equal(view.get('approved-choices').children.length, 50);
  assert.equal(view.get('unresolved-choices').children.length, 5);
  assert.deepEqual(JSON.parse(view.get('snapshot-json').textContent), snapshot);
});

test('surface unit: a keyboard-focused probe restores focus after validation', async () => {
  const view = await surface();
  view.document.activeElement = view.get('probe');
  await view.get('probe').listeners.click();
  const result = JSON.parse(view.get('decision-json').textContent);
  assert.equal(result.allowed, true);
  assert.equal(result.executed, false);
  assert.equal(view.get('probe').focusCalls, 1);
  assert.equal(view.get('probe').disabled, false);
});

test('surface unit: a later validator failure removes stale allowance and disables controls', async () => {
  const validator = { validateApproval: guard.validateApproval, guardOperation: guard.guardOperation };
  const view = await surface(snapshot, validator);
  await view.get('probe').listeners.click();
  assert.equal(view.get('result').dataset.allowed, 'true');
  validator.guardOperation = async () => { throw new Error('unavailable'); };
  await view.get('probe').listeners.click();
  assert.equal(view.get('result').dataset.allowed, 'false');
  assert.match(view.get('result').textContent, /^DENIED/);
  assert.equal(view.get('probe').disabled, true);
  assert.equal(view.get('action').disabled, true);
  const result = JSON.parse(view.get('decision-json').textContent);
  assert.equal(result.allowed, false);
  assert.equal(result.executed, false);
});
