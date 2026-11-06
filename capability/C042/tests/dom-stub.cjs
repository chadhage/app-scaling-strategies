'use strict';

// Test tooling, not production code: a minimal DOM whose elements come from the real index.html, so page.js runs under
// Node (in a vm context, with the real contract.js loaded first) and is measured instead of being excluded.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const markupIds = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);

// After EVERY user action the rendered page must still be coherent: no repeated ids anywhere, one commit at most in a
// journal trail, a gap-free event table, and the submit exchanges it shows partition into applied, replayed and the rest.
function renderedInvariants(document) {
  const element = (id) => document.element(id);
  const unique = (list, label) => assert.equal(new Set(list).size, list.length, `${label} repeats: ${list.join(', ')}`);
  const trail = element('trail').lines().map((line) => /^#(\d+) ([a-z]+)$/.exec(line));
  assert.equal(trail.every(Boolean), true, 'every trail line is "#seq type"');
  const seqs = trail.map((match) => Number(match[1]));
  unique(seqs, 'journal trail');
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'the trail is in order');
  assert.equal(trail.filter((match) => match[2] === 'commit').length <= 1, true, 'at most one commit per step');
  unique(element('did-not').lines().map((line) => line.split(':')[0]), 'what-did-not codes');
  unique(element('recovery').labels(), 'recovery controls');
  unique(element('result').children.filter((child) => child.tagName === 'dt').map((child) => child.textContent), 'result labels');
  const rows = element('events').children;
  const numbers = rows.map((row) => Number(row.children[0].textContent));
  unique(numbers, 'event numbers');
  assert.deepEqual(numbers, numbers.map((_, index) => index + 1), 'the event table has no gap');
  const submits = rows.filter((row) => /^POST \/v1\/steps( |$)/.test(row.children[2].textContent));
  const statuses = submits.map((row) => row.children[3].textContent);
  const applied = statuses.filter((status) => status === '201').length;
  const replayed = statuses.filter((status) => status === '200').length;
  assert.equal(applied + replayed + statuses.filter((status) => status !== '201' && status !== '200').length, submits.length, 'applied + replayed + refused equals what was delivered');
  unique(markupIds, 'element ids in index.html');
}

class FakeElement {
  constructor(document, id, tagName) {
    Object.assign(this, { document, id, tagName, textContent: '', className: '', disabled: false, value: '', title: '', type: '', children: [], listeners: new Map() });
  }

  replaceChildren(...children) { this.children = children; }

  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }

  focus() { this.document.active = this; }

  async dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) await listener({ type, preventDefault() { this.prevented = true; } });
    this.document.afterAction?.();
  }

  async click() { if (!this.disabled) await this.dispatch('click'); }

  buttons() { return this.children.filter((child) => child.tagName === 'button'); }

  labels() { return this.buttons().map((button) => button.textContent); }

  lines() { return this.children.map((child) => child.textContent); }
}

function createDocument(html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')) {
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

function runPage({ fetch, document = createDocument(), checkAfterActions = true } = {}) {
  if (checkAfterActions) document.afterAction = () => renderedInvariants(document);
  const context = vm.createContext({ document, fetch, console });
  // A file URL as the script name lets Node coverage attribute the run to the real files.
  for (const name of ['contract.js', 'page.js']) {
    const file = path.join(root, name);
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: pathToFileURL(file).href }).runInContext(context);
  }
  return { document, context };
}

module.exports = Object.freeze({ FakeElement, createDocument, networkFetch, renderedInvariants, runPage });
