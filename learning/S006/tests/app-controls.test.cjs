'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../model.js');
const verifier = require('../verifier.js');

const lesson = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(lesson, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(lesson, 'app.js'), 'utf8');

function openLesson() {
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.dataset = {};
      this.listeners = new Map();
      this.value = '';
      this.disabled = false;
      this.hidden = false;
      this.defaultSelected = false;
      this.text = '';
    }
    get textContent() {
      return this.text + this.children.map((child) => child.textContent).join('');
    }
    set textContent(value) {
      this.text = String(value);
      this.children = [];
    }
    append(...children) {
      for (const child of children) {
        this.children.push(child);
        if (this.tagName === 'SELECT' && (child.defaultSelected || this.children.length === 1)) {
          this.value = child.value;
        }
      }
    }
    replaceChildren(...children) {
      this.text = '';
      this.children = children;
    }
    addEventListener(type, handler) {
      const handlers = this.listeners.get(type) || [];
      handlers.push(handler);
      this.listeners.set(type, handlers);
    }
    dispatch(type) {
      for (const handler of this.listeners.get(type) || []) {
        handler({ preventDefault() {} });
      }
    }
    removeAttribute(name) {
      if (name === 'data-verdict') delete this.dataset.verdict;
    }
  }
  const elements = new Map();
  class Form extends Element {
    reset() {
      for (const element of elements.values()) {
        if (element.tagName !== 'SELECT') continue;
        element.value = (element.children.find((option) => option.defaultSelected)
          || element.children[0]).value;
      }
    }
  }
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const element = match[1] === 'form' ? new Form(match[1]) : new Element(match[1]);
    element.hidden = /\bhidden\b/.test(match[2]);
    elements.set(match[3], element);
  }
  for (const match of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    for (const option of match[2].matchAll(/<option\b([^>]*value="([^"]+)"[^>]*)>([^<]*)<\/option>/g)) {
      const element = new Element('option');
      element.value = option[2];
      element.textContent = option[3];
      element.defaultSelected = /\bselected\b/.test(option[1]);
      elements.get(match[1]).append(element);
    }
  }
  const formMarkup = html.match(/<form\b[^>]*id="exercise"[^>]*>([\s\S]*?)<\/form>/)[1];
  for (const match of formMarkup.matchAll(/<(?:button|select|input)\b[^>]*id="([^"]+)"[^>]*>/g)) {
    // Named form controls shadow prototype methods in the real browser DOM.
    elements.get('exercise')[match[1]] = elements.get(match[1]);
  }
  const document = {
    getElementById: (id) => elements.get(id),
    createElement: (tag) => new Element(tag)
  };
  vm.runInNewContext(source, {
    document, HTMLFormElement: Form, PreviewModel: model, PreviewVerifier: verifier
  }, { filename: 'app.js' });
  return {
    get: (id) => elements.get(id),
    emit: (id, type) => elements.get(id).dispatch(type)
  };
}

test('Reset clears populated results despite its named form control and supports a fresh Probe 1', () => {
  const { get, emit } = openLesson();
  assert.notEqual(typeof get('exercise').reset, 'function', 'fixture reproduces browser method shadowing');
  emit('exercise', 'submit');
  get('identity').value = 'visitor';
  get('route').value = 'direct-api';
  emit('exercise', 'submit');
  get('identity').value = 'missing';
  emit('exercise', 'submit');
  get('identity').value = 'visitor';
  get('policy').value = 'obscurity-only';
  emit('policy', 'change');
  emit('exercise', 'submit');
  emit('compare-routes', 'click');
  assert.equal(get('history').children.length, 4);
  assert.equal(get('outcome').hidden, false);
  assert.ok(get('trace-body').children.length > 0);
  assert.equal(get('policy-warning').hidden, false);

  assert.doesNotThrow(() => emit('reset', 'click'));
  assert.equal(get('identity').value, 'approved');
  assert.equal(get('route').value, 'join-preview');
  assert.equal(get('policy').value, 'enforced');
  assert.equal(get('callback').value, 'bound');
  assert.equal(get('callback').disabled, false);
  assert.equal(get('policy-warning').hidden, true);
  assert.equal(get('outcome').hidden, true);
  assert.equal(get('history-empty').hidden, false);
  for (const id of [
    'trace-body', 'assertion-body', 'comparison-body', 'history', 'decision',
    'synthetic-status', 'served-version', 'verifier-result', 'user-impact', 'ga-impact',
    'ga-before', 'ga-after', 'preview-before', 'preview-after'
  ]) {
    assert.equal(get(id).children.length, 0, `${id} children cleared`);
    assert.equal(get(id).textContent, '', `${id} text cleared`);
  }
  assert.equal(get('verifier-result').dataset.verdict, undefined);
  assert.match(get('cleanup-result').textContent, /Reset complete/);
  assert.match(get('live-status').textContent, /Results and history cleared/);
  assert.doesNotThrow(() => emit('reset', 'click'), 'reset is idempotent');
  emit('exercise', 'submit');
  assert.equal(get('history').children.length, 1);
  assert.match(get('history').children[0].textContent, /^Probe 1:/);
  assert.equal(get('decision').textContent, 'allowed');
  assert.equal(get('served-version').textContent, 'v2');
});

test('unrecognized route control updates safely and retains a fail-closed rejected probe', () => {
  const { get, emit } = openLesson();
  get('route').value = '';
  assert.doesNotThrow(() => emit('route', 'change'));
  assert.match(get('path').textContent, /unknown route/i);
  assert.equal(get('callback').disabled, true);
  emit('exercise', 'submit');
  assert.equal(get('decision').textContent, 'configuration-rejected');
  assert.equal(get('synthetic-status').textContent, '400');
  assert.equal(get('served-version').textContent, 'none');
  assert.match(get('verifier-result').textContent, /^PASS/);
  assert.match(get('live-status').textContent, /configuration-rejected/);
  assert.equal(get('history').children[0].dataset.decision, 'configuration-rejected');
  assert.ok(get('trace-body').children.some((row) => row.dataset.stage === 'configuration.reject'));
});

for (const control of ['policy', 'callback']) {
  test(`invalid ${control} control fails closed rather than authorizing the default approved identity`, () => {
    const { get, emit } = openLesson();
    get(control).value = '';
    if (control === 'policy') emit('policy', 'change');
    emit('exercise', 'submit');
    assert.equal(get('decision').textContent, 'configuration-rejected');
    assert.equal(get('synthetic-status').textContent, '400');
    assert.equal(get('served-version').textContent, 'none');
    assert.match(get('verifier-result').textContent, /^PASS/);
  });
}

test('comparison renders all 40 entry and identity probes without replacing single-probe history', () => {
  const { get, emit } = openLesson();
  emit('exercise', 'submit');
  const trace = get('trace-body').textContent;
  emit('compare-routes', 'click');
  assert.equal(get('comparison-body').children.length, 10);
  assert.match(get('comparison-caption').textContent, /^40 synthetic probes/);
  assert.match(get('live-status').textContent, /Compared 40 synthetic probes: 0 verifier failures/);
  for (const row of get('comparison-body').children) {
    assert.equal(row.children.length, 5);
    if (row.dataset.route === 'ordinary') continue;
    assert.equal(row.children[1].dataset.decision, 'allowed');
    assert.equal(row.children[2].dataset.decision, 'forbidden');
    assert.equal(row.children[3].dataset.decision, 'unknown');
    assert.equal(row.children[4].dataset.decision, 'unknown');
  }
  assert.equal(get('trace-body').textContent, trace);
  assert.equal(get('history').children.length, 1);
  get('policy').value = 'obscurity-only';
  emit('compare-routes', 'click');
  assert.match(get('comparison-caption').textContent, /27 verifier failures/);
});

test('history remains bounded and preserves denial, unknown, and unsafe outcomes', () => {
  const { get, emit } = openLesson();
  for (let index = 0; index < 15; index += 1) emit('exercise', 'submit');
  get('route').value = 'direct-api';
  get('identity').value = 'visitor';
  emit('exercise', 'submit');
  get('identity').value = 'missing';
  emit('exercise', 'submit');
  get('policy').value = 'obscurity-only';
  emit('exercise', 'submit');
  const history = get('history').children;
  assert.equal(history.length, 12);
  assert.equal(history[0].dataset.verdict, 'fail');
  assert.match(history[0].textContent, /unauthorized preview exposure/);
  assert.equal(history[1].dataset.decision, 'unknown');
  assert.equal(history[2].dataset.decision, 'forbidden');
});
