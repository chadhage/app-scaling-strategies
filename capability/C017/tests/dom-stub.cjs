'use strict';

// Test tooling, not production code: loads the REAL contract.js and page.js in a vm context (no module, browser-global branch)
// against a DOM stub with one element per id of the real index.html, so markup and script must agree (L-0044, L-0053).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');

class Element {
  constructor(tag, document, id = '') {
    Object.assign(this, { tag, id, ownerDocument: document, textContent: '', children: [], disabled: false, checked: false, listeners: {} });
  }

  addEventListener(type, handler) { (this.listeners[type] = this.listeners[type] || []).push(handler); }

  replaceChildren(...nodes) { this.children = nodes; }

  focus() { this.ownerDocument.activeElement = this; }

  click() { return this.disabled ? Promise.resolve([]) : Promise.all((this.listeners.click || []).map((handler) => handler({ type: 'click' }))); }

  texts() { return this.children.map((child) => child.textContent); }
}

function loadPage({ fetch, origin } = {}) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const document = { activeElement: null, elements: {} };
  document.getElementById = (id) => document.elements[id] || null;
  document.createElement = (tag) => new Element(tag, document);
  for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) document.elements[id] = new Element('x', document, id);
  const timers = [];
  const sent = [];
  let inflight = 0;
  let counter = 0;
  let parse = null;
  // Bodies are re-parsed inside the page's own realm, as a real browser would deliver them.
  const wrapped = (target, init) => {
    inflight += 1;
    if (init && init.method === 'POST') sent.push({ path: target, body: JSON.parse(init.body) });
    const base = typeof origin === 'function' ? origin() : origin;
    return Promise.resolve(fetch(base ? base + target : target, init))
      .then((res) => ({ status: res.status, json: async () => parse(JSON.stringify(await res.json())) }))
      .finally(() => { inflight -= 1; });
  };
  const context = vm.createContext({
    document, fetch: wrapped, crypto: { randomUUID: () => `uuid-${(counter += 1)}` }, console,
    setTimeout: (handler) => { timers.push(handler); return timers.length; }, clearTimeout: () => {},
  });
  parse = vm.runInContext('(text) => JSON.parse(text)', context);
  for (const file of ['contract.js', 'page.js']) {
    new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: pathToFileURL(path.join(root, file)).href }).runInContext(context);
  }
  const settle = async () => { for (let i = 0; i < 40 && (inflight > 0 || i < 4); i += 1) await new Promise((resolve) => setImmediate(resolve)); };
  return { document, el: (id) => document.elements[id], timers, sent, settle, context };
}

module.exports = Object.freeze({ loadPage, Element });
