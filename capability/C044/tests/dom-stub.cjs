'use strict';

// Test tooling, not production code: one stub element per id of the real index.html, so markup and script must agree.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const cursors = require('../cursor.js');
const reducer = require('../reducer.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pageFile = path.join(root, 'page.js');
const pageSource = fs.readFileSync(pageFile, 'utf8');

class Element {
  constructor(tag, attributes = {}) {
    this.tag = tag;
    this.id = attributes.id || '';
    this.textContent = '';
    this.className = '';
    this.title = '';
    this.type = '';
    this.disabled = Object.hasOwn(attributes, 'disabled');
    this.value = attributes.value || '';
    this.children = [];
    this.handlers = {};
    this.focusCount = 0;
  }

  addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); }

  replaceChildren(...nodes) { this.children = nodes; }

  focus() { this.focusCount += 1; }

  click() { if (!this.disabled) for (const handler of this.handlers.click || []) handler({ type: 'click' }); }
}

function markupElements() {
  const elements = {};
  for (const match of html.matchAll(/<(\w+)([^>]*\sid="([^"]+)"[^>]*)>/g)) {
    const attributes = { id: match[3] };
    if (/\sdisabled(\s|>|$)/.test(match[2])) attributes.disabled = '';
    const value = /\svalue="([^"]*)"/.exec(match[2]);
    if (value) attributes.value = value[1];
    elements[match[3]] = new Element(match[1], attributes);
  }
  return elements;
}

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = {};
    this.closed = false;
    FakeEventSource.instances.push(this);
  }

  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }

  close() { this.closed = true; this.readyState = 2; }

  open() { this.readyState = 1; if (this.onopen) this.onopen({}); }

  emit(type, id, data) {
    for (const handler of this.listeners[type] || []) handler({ type, lastEventId: id, data: typeof data === 'string' ? data : JSON.stringify(data) });
  }

  fail(readyState) { this.readyState = readyState; if (this.onerror) this.onerror({}); }
}
FakeEventSource.CLOSED = 2;

const flush = async () => { for (let turn = 0; turn < 8; turn++) await new Promise((resolve) => setImmediate(resolve)); };

function loadPage({ eventSource = true, fetchHandler } = {}) {
  FakeEventSource.instances = [];
  const elements = markupElements();
  const timers = [];
  const fetchCalls = [];
  const sandbox = {
    document: {
      getElementById(id) { if (!elements[id]) throw new Error(`index.html has no element #${id}`); return elements[id]; },
      createElement(tag) { return new Element(tag); },
    },
    C044Cursor: cursors,
    C044Reducer: reducer,
    setTimeout(fn, ms) { timers.push({ fn, ms, active: true }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].active = false; },
    async fetch(url) {
      fetchCalls.push(url);
      const value = fetchHandler ? await fetchHandler(url) : { counters: { produced: 0, clientsAttached: 0 }, run: { headSeq: 0, status: 'running' } };
      return { json: async () => { if (value instanceof Error) throw value; return value; } };
    },
  };
  if (eventSource) sandbox.EventSource = FakeEventSource;
  const context = vm.createContext(sandbox);
  new vm.Script(pageSource, { filename: pathToFileURL(pageFile).href }).runInContext(context);
  return {
    elements, timers, fetchCalls, sources: FakeEventSource.instances, flush,
    runTimers() { for (const timer of timers.filter((entry) => entry.active)) { timer.active = false; timer.fn(); } },
    texts: (id) => elements[id].textContent,
    items: (id) => elements[id].children.map((child) => child.textContent),
  };
}

module.exports = Object.freeze({ loadPage, FakeEventSource, Element, markupElements, html, pageSource });
