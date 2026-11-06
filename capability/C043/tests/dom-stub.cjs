'use strict';

// Test tooling, not production code: a minimal DOM whose elements come from the real index.html, so page.js runs under
// Node (in a vm context, with the real scripts loaded in the real order) and is measured instead of being excluded.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const markupIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const SCRIPTS = [...html.matchAll(/<script defer src="([^"]+)"/g)].map((match) => match[1]);

// After EVERY user action the rendered page must still be coherent: no repeated ids, a progress list that reconciles
// with the listings, unique controls and labels, and a gap-free event table.
function renderedInvariants(document) {
  const element = (id) => document.element(id);
  const unique = (list, label) => assert.equal(new Set(list).size, list.length, `${label} repeats: ${list.join(', ')}`);
  unique(markupIds, 'element ids in index.html');
  const rows = element('progress').children;
  const keys = rows.map((row) => /Step \d+ · (\S+) ·/.exec(row.textContent)?.[1]);
  assert.equal(keys.every(Boolean), true, 'every progress row names its step key');
  unique(keys, 'progress step keys');
  assert.deepEqual(rows.map((row) => Number(/^Step (\d+)/.exec(row.textContent)[1])), rows.map((_, index) => index + 1), 'progress rows are numbered without a gap');
  const ran = element('listing-ran').children.length;
  const notRun = element('listing-notrun').children.length;
  if (element('result').children.length > 0) {
    assert.equal(ran + notRun, rows.length, 'ran + not run equals the steps shown');
    assert.equal(rows.filter((row) => !/status-not-run/.test(row.className)).length, ran, 'the ran listing equals the rows that are not "not run"');
    assert.equal(element('listing-effects').children.length, rows.filter((row) => /status-(succeeded|replayed)/.test(row.className)).length, 'effects equal the succeeded and replayed rows');
  }
  unique(element('listing-ran').lines(), 'ran listing');
  unique(element('listing-effects').lines(), 'effects listing');
  unique(element('did-not').lines().map((line) => line.split(':')[0]), 'what-did-not codes');
  unique(element('recovery').labels(), 'recovery controls');
  unique(element('result').children.filter((child) => child.tagName === 'dt').map((child) => child.textContent), 'result labels');
  const seqs = element('trail').lines().map((line) => Number(/^#(\d+) /.exec(line)?.[1]));
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'the trail is in order');
  unique(seqs, 'journal trail');
  const events = element('events').children;
  const numbers = events.map((row) => Number(row.children[0].textContent));
  assert.deepEqual(numbers, numbers.map((_, index) => index + 1), 'the event table has no gap');
}

class FakeElement {
  constructor(document, id, tagName) {
    Object.assign(this, { document, id, tagName, textContent: '', className: '', disabled: false, value: '', title: '', type: '', children: [], listeners: new Map() });
  }

  replaceChildren(...children) {
    this.children = children;
    // A browser's select reports its first option until the user picks another.
    if (this.tagName === 'select') this.value = children[0]?.value ?? '';
  }

  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }

  focus() { this.document.active = this; }

  async dispatch(type) {
    const event = { type, preventDefault() { this.prevented = true; } };
    for (const listener of this.listeners.get(type) ?? []) await listener(event);
    this.document.afterAction?.();
    return event;
  }

  async click() { if (!this.disabled) await this.dispatch('click'); }

  buttons() { return this.children.filter((child) => child.tagName === 'button'); }

  labels() { return this.buttons().map((button) => button.textContent); }

  lines() { return this.children.map((child) => child.textContent); }
}

function createDocument() {
  const elements = new Map();
  const document = {
    elements, active: null,
    getElementById(id) { return elements.get(id) ?? null; },
    createElement(tagName) { return new FakeElement(document, null, tagName); },
    element(id) {
      if (!elements.has(id)) throw new Error(`NO_SUCH_ELEMENT_IN_INDEX_HTML ${id}`);
      return elements.get(id);
    },
  };
  for (const match of html.matchAll(/<(\w+)\b([^>]*?)\bid="([^"]+)"([^>]*)>([^<]*)/g)) {
    const element = new FakeElement(document, match[3], match[1]);
    const value = /\bvalue="([^"]*)"/.exec(`${match[2]}${match[4]}`);
    if (value) element.value = value[1];
    if (!['input', 'textarea', 'select', 'button'].includes(match[1])) element.textContent = match[5].trim();
    elements.set(match[3], element);
  }
  return document;
}

// A fetch that performs a real loopback HTTP exchange, so the page is driven against the real service.
function networkFetch(port) {
  return (route, options = {}) => new Promise((resolve, reject) => {
    const payload = options.body === undefined ? null : Buffer.from(options.body);
    const headers = { ...(options.headers ?? {}), ...(payload ? { 'Content-Length': payload.length } : {}) };
    const request = http.request({ host: '127.0.0.1', port, method: options.method ?? 'GET', path: route, agent: false, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: response.statusCode, ok: response.statusCode >= 200 && response.statusCode < 300, json: async () => JSON.parse(text) });
      });
    });
    request.on('error', reject);
    request.end(payload);
  });
}

// Manual timers: the page's progress poll runs only when the test says so.
function manualTimers() {
  const pending = new Map();
  let next = 1;
  return {
    setTimeout: (callback) => { pending.set(next, callback); return next++; },
    clearTimeout: (id) => { pending.delete(id); },
    count: () => pending.size,
    async fire() { const entries = [...pending.entries()]; pending.clear(); for (const [, callback] of entries) await callback(); },
  };
}

function runPage({ fetch, document = createDocument(), checkAfterActions = true, timers = manualTimers() } = {}) {
  if (checkAfterActions) document.afterAction = () => renderedInvariants(document);
  const context = vm.createContext({ document, fetch, console, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  // A file URL as the script name lets Node coverage attribute the run to the real files.
  for (const name of SCRIPTS) {
    const file = path.join(root, name === 'c042-contract.js' ? path.join('..', 'C042', 'contract.js') : name);
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: pathToFileURL(file).href }).runInContext(context);
  }
  return { document, context, timers };
}

module.exports = Object.freeze({ FakeElement, SCRIPTS, createDocument, manualTimers, networkFetch, renderedInvariants, runPage });
