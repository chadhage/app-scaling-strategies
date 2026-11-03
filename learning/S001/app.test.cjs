'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function node() {
  return {
    textContent: '', dataset: {}, children: [], listeners: new Map(),
    addEventListener(event, callback) { this.listeners.set(event, callback); },
    appendChild(child) { this.children.push(child); },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; }
  };
}

function loadApp(condition = 'healthy') {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => [match[1], node()]));
  const actions = ['warm', 'handoff', 'drain', 'elapse', 'retire'];
  for (const id of actions) elements.get(id).dataset.action = id;
  elements.get('condition').value = condition;
  const context = {
    document: {
      getElementById(id) { return elements.get(id); },
      querySelectorAll(selector) {
        assert.equal(selector, 'button[data-action]');
        return actions.map((id) => elements.get(id));
      },
      createElement: node
    }
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ['engine.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
  }
  return {
    elements,
    text(id) { return elements.get(id).textContent; },
    fire(id, event = 'click') { elements.get(id).listeners.get(event)(); },
    select(value) {
      elements.get('condition').value = value;
      this.fire('condition', 'change');
    }
  };
}

function assertFresh(app, condition) {
  assert.equal(app.elements.get('condition').value, condition);
  assert.equal(app.text('verdict'), 'NOT RUN');
  assert.equal(app.text('admission-target'), 'v1');
  assert.equal(app.text('v1-state'), 'ACTIVE');
  assert.equal(app.text('v2-state'), 'WARMING');
  assert.equal(app.text('retention'), '0 / 1000 ms');
  assert.equal(app.text('new-work'), 'No transition attempted.');
  assert.equal(JSON.parse(app.text('old-work')).status, 'running');
  assert.equal(JSON.parse(app.text('old-work')).effectCount, 0);
  assert.equal(JSON.parse(app.text('fixture-input')).condition, condition);
  assert.equal(app.elements.get('trace').children.length, 1);
  assert.equal(app.elements.get('assertions').children[0].children[0].textContent,
    'No observations yet. Empty evidence is not a success.');
  assert.match(app.text('sample-count'), /Attempted: 0.*proven successful: 0.*interrupted: 0/);
  assert.match(app.text('result-announcement'), /NOT RUN/);
}

test('Reset clears PASS, FAIL, and UNKNOWN results while retaining the selected fixture', () => {
  for (const condition of [
    'healthy', 'dependency-failure', 'incompatible-state', 'duplicate-effects',
    'slow-warmup', 'missing-readiness', 'stale-readiness',
    'missing-admission', 'regressed-handoff'
  ]) {
    const app = loadApp(condition);
    app.fire('warm');
    app.fire('handoff');
    if (condition === 'healthy') {
      for (const action of ['drain', 'elapse', 'retire']) app.fire(action);
      assert.equal(app.text('cleanup-kind'), 'COMPLETE');
    }
    assert.ok(['PASS', 'FAIL', 'UNKNOWN'].includes(app.text('verdict')));
    app.fire('reset');
    assertFresh(app, condition);
  }
});

test('invalid condition changes and Reset discard stale PASS instead of throwing', () => {
  for (const condition of ['', 'not-a-fixture', '__proto__']) {
    const app = loadApp();
    app.fire('warm');
    app.fire('handoff');
    assert.equal(app.text('verdict'), 'PASS');
    assert.doesNotThrow(() => app.select(condition));
    assert.doesNotThrow(() => app.fire('reset'));
    for (const action of ['warm', 'handoff', 'drain', 'elapse', 'retire']) app.fire(action);
    assert.equal(app.text('verdict'), 'FAIL');
    assert.equal(app.text('v2-state'), 'ABORTED');
    assert.equal(app.text('admission-target'), 'v1');
    assert.equal(app.text('impact-kind'), 'SAFE-ABORT');
    assert.equal(app.text('new-work'), 'No transition attempted.');
    assert.equal(JSON.parse(app.text('old-work')).status, 'running');
    assert.deepEqual(JSON.parse(app.text('fixture-input')), { accepted: false });
    assert.match(app.text('expected'), /invalid synthetic condition/i);
    assert.match(app.text('sample-count'), /Attempted: 0.*proven successful: 0/);
    app.select('healthy');
    assertFresh(app, 'healthy');
    app.fire('warm');
    assert.equal(app.text('verdict'), 'READY');
  }
});

test('invalid initial condition data renders an explicit rejection without an uncaught error', () => {
  const app = loadApp('');
  assert.equal(app.text('verdict'), 'FAIL');
  assert.equal(app.text('admission-target'), 'v1');
  assert.deepEqual(JSON.parse(app.text('fixture-input')), { accepted: false });
});
