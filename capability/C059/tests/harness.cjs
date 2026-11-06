'use strict';

// Test tooling, not production code: drives the REAL page.js under the DOM stub against the REAL C042 engine, and holds the
// page to the accessibility contract after EVERY action: the production checker, an independent oracle, the announcement log.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const checker = require('../a11y-check.js');
const { idle, loadPage, press, type } = require('./dom.cjs');
const { engineFetch } = require('./engine-fetch.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const c042 = (name) => require(path.join(repository, 'capability', 'C042', name));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const resolveScript = (src) => (src.startsWith('/c042/') ? path.join(repository, 'capability', 'C042', src.slice(6))
  : src.startsWith('/c041/') ? path.join(repository, 'capability', 'C041', src.slice(6)) : path.join(root, src.slice(1)));

function gate() {
  const slots = new Map();
  const slot = (key) => {
    if (!slots.has(key)) {
      const entry = {};
      entry.entered = new Promise((resolve) => { entry.enter = resolve; });
      entry.released = new Promise((resolve) => { entry.release = resolve; });
      slots.set(key, entry);
    }
    return slots.get(key);
  };
  return { executor: async ({ key }) => { slot(key).enter(); await slot(key).released; }, entered: (key) => slot(key).entered, release: (key) => slot(key).release() };
}

// An independent oracle (no code shared with a11y-check.js): the properties every state of the page must have.
function oracle(document, { busy = false } = {}) {
  const problems = [];
  const all = document.elements();
  const named = (element) => {
    const labelled = (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join('').trim();
    const label = all.find((item) => item.localName === 'label' && element.id && item.getAttribute('for') === element.id);
    return labelled || (element.getAttribute('aria-label') ?? '').trim() || (label ? label.textContent.trim() : '') || (['input', 'select'].includes(element.localName) ? '' : element.textContent.trim()) || element.title;
  };
  for (const element of all.filter((item) => ['button', 'select', 'input', 'iframe'].includes(item.localName) || item.getAttribute('role') === 'radio' || (item.localName === 'a' && item.hasAttribute('href')))) {
    if (!element.focusable() && element.localName !== 'iframe') continue;
    if (!named(element)) problems.push(`unnamed ${element.localName}#${element.id}`);
  }
  const live = all.filter((item) => item.hasAttribute('aria-live') || ['status', 'alert', 'log'].includes(item.getAttribute('role')));
  if (live.length !== 1 || live[0].getAttribute('role') !== 'status') problems.push(`live regions: ${live.map((item) => item.id).join(',')}`);
  const active = document.activeElement;
  if (active.localName === 'body' || !active.isConnected || !named(active)) problems.push(`focus on ${active.localName}#${active.id}`);
  const outcome = all.find((item) => item.hasAttribute('data-outcome'))?.getAttribute('data-outcome');
  if (outcome !== 'succeeded' && /\bsucce(?:ss|eded)\b/i.test(live[0]?.textContent ?? '')) problems.push(`success wording while ${outcome}`);
  const ids = all.map((item) => item.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) problems.push('duplicate id');
  if (!busy && all.some((item) => item.getAttribute('aria-busy') === 'true')) problems.push('still busy');
  return problems;
}

async function openSession({ io = c042('journal.cjs').createMemoryIo(), executor, wrap, globals, skip } = {}) {
  const engine = await c042('engine.cjs').openEngine({ io, executor });
  const base = engineFetch({ engine, parseBody: c042('input.cjs').parseBody, refusal: c042('result.cjs').refusal });
  const page = loadPage({ html, resolve: resolveScript, fetch: wrap ? wrap(base) : base, globals, skip });
  const { document } = page;
  const $ = (id) => document.getElementById(id);
  const verify = (label, options = {}) => {
    const verdict = checker.check(document, options);
    assert.deepEqual(verdict.findings.map((item) => `${item.code} ${item.selector}`), [], `${label}: the checker found defects`);
    assert.deepEqual(oracle(document), [], `${label}: the oracle found defects`);
  };
  // One user action: run it, wait for quiescence, then hold the page to the contract. Returns what was announced.
  async function act(label, action, options = {}) {
    const before = document.announcements.length;
    const previousFocus = document.activeElement;
    await action();
    await idle(document);
    const announced = document.announcements.slice(before).map((entry) => entry.text).filter((text) => text !== '');
    verify(label, { previousFocus, ...options.check });
    if (options.announced !== undefined) assert.equal(announced.length, options.announced, `${label}: announcements ${JSON.stringify(announced)}`);
    return { announced, active: document.activeElement, text: $('status').textContent };
  }
  const session = {
    get engine() { return base.state.engine; },
    fetch: base, document, context: page.context, io, $, act, verify,
    press: (key, options) => press(document, key, options),
    fill({ key, lease, units }) {
      if (key !== undefined) type($('key'), key);
      if (lease !== undefined) $('lease').value = lease;
      if (units !== undefined) type($('units'), String(units));
    },
    submit: () => { $('submit').focus(); return press(document, 'Enter'); },
    radios: () => document.elements().filter((item) => item.getAttribute('role') === 'radio'),
    outcome: () => $('result').getAttribute('data-outcome'),
    async restart(restartExecutor) {
      base.state.engine.halt();
      base.state.engine = await c042('engine.cjs').openEngine({ io, executor: restartExecutor });
    },
    buttons: () => $('recovery').children.map((item) => item.id),
  };
  verify('initial render');
  return session;
}

module.exports = { checker, gate, openSession, oracle, resolveScript, root, repository, c042 };
