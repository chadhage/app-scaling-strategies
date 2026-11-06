'use strict';

// DOM stub for page.js under Node (L-0044, L-0053): one stub element per id of the REAL index.html, the REAL script list of that file
// run in order inside a vm context, and counting stubs for every network and timer API (scrubbing must call none of them).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map((match) => path.resolve(root, match[1]));
const compiled = new Map();
// Each real script is compiled once per process (filename = its file URL, so coverage lands on the real file) and run in every fresh context.
const script = (file) => {
  if (!compiled.has(file)) compiled.set(file, new vm.Script(fs.readFileSync(file, 'utf8'), { filename: pathToFileURL(file).href }));
  return compiled.get(file);
};

class StubElement {
  constructor(document, tag) {
    Object.assign(this, { document, tag, id: '', dataset: {}, attributes: new Map(), children: [], listeners: new Map(), text: '', value: '',
      disabled: false, className: '', style: {} });
  }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(''); }
  set textContent(value) { this.text = String(value); this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.text = ''; this.children = nodes; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) || []), listener]); }
  focus() { this.document.activeElement = this; }
  dispatch(type, event = {}) {
    const record = { type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...event };
    for (const listener of this.listeners.get(type) || []) listener(record);
    return record;
  }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
}

function createDocument() {
  const document = { activeElement: null, elements: new Map() };
  for (const match of html.matchAll(/<(\w+)\b([^>]*)>([^<]*)/g)) {
    const id = /\sid="([^"]+)"/.exec(match[2])?.[1];
    if (!id) continue;
    const element = new StubElement(document, match[1]);
    element.id = id;
    element.text = match[3].replace(/\s+/g, ' ').trim();
    element.disabled = /\sdisabled(?:\s|$)/.test(match[2]);
    for (const attribute of match[2].matchAll(/\s(aria-[a-z]+|tabindex|role)="([^"]*)"/g)) element.attributes.set(attribute[1], attribute[2]);
    for (const attribute of match[2].matchAll(/\sdata-([a-z-]+)="([^"]*)"/g)) element.dataset[attribute[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = attribute[2];
    document.elements.set(id, element);
  }
  document.getElementById = (id) => document.elements.get(id);
  document.created = [];
  document.createElement = (tag) => { document.created.push(tag); return new StubElement(document, tag); };
  return document;
}

// Loads the real page: hash is location.hash at load; saved optionally replaces the X001Saved global (tests with tiny or hostile sets);
// patch optionally maps a script file name to a function that rewrites its source before it runs (a test that injects a failing verify).
function loadPage({ hash = '', saved = null, patch = null } = {}) {
  const document = createDocument();
  const calls = [];
  const listeners = new Map();
  const location = { hash };
  const history = { calls: [], replaceState(state, title, url) { this.calls.push(url); location.hash = url; } };
  const sandbox = { document, location, history, calls };
  for (const name of ['fetch', 'XMLHttpRequest', 'EventSource', 'WebSocket', 'setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame', 'queueMicrotask']) {
    sandbox[name] = function stub() { calls.push(name); throw new Error(`${name} must never be used while scrubbing`); };
  }
  sandbox.window = sandbox;
  sandbox.addEventListener = (type, listener) => listeners.set(type, [...(listeners.get(type) || []), listener]);
  const context = vm.createContext(sandbox);
  for (const file of scripts) {
    if (saved && path.basename(file) === 'saved.js') { vm.runInContext(`Object.defineProperty(globalThis, 'X001Saved', { value: ${JSON.stringify(saved)} });`, context); continue; }
    if (patch && patch[path.basename(file)]) {
      new vm.Script(patch[path.basename(file)](fs.readFileSync(file, 'utf8')), { filename: pathToFileURL(file).href }).runInContext(context);
      continue;
    }
    script(file).runInContext(context);
  }
  const $ = (id) => document.getElementById(id);
  return {
    document, context, calls, location, history, $,
    click: (id) => $(id).dispatch('click'),
    key: (key) => $('scrub').dispatch('keydown', { key }),
    changeHash(next) { location.hash = next; for (const listener of listeners.get('hashchange') || []) listener({ type: 'hashchange' }); },
    text: (id) => $(id).textContent,
    position: () => Number($('position').dataset.position),
    ids() { return [...document.elements.keys(), ...$('entries').descendants().map((item) => item.id), ...$('state').descendants().map((item) => item.id)].filter(Boolean); },
  };
}

module.exports = Object.freeze({ StubElement, createDocument, loadPage, html, scripts, root });
