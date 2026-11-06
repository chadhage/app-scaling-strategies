'use strict';

// Test tooling, not production code: the document, a small HTML parser (well-formed markup only), the keyboard defaults of
// a browser (Tab order, Enter, Space, arrows in a select), a fetch over real loopback sockets and a vm page loader.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { ENTITIES, Element, Event, Node, Text, VOID } = require('./dom-nodes.cjs');

const decode = (text) => text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity]);

class Document extends Node {
  constructor() {
    super(null);
    Object.assign(this, { nodeType: 9, ownerDocument: this, documentElement: null, focused: null, announcements: [], readyState: 'complete' });
  }

  get body() { return this.find((element) => element.localName === 'body'); }

  get head() { return this.find((element) => element.localName === 'head'); }

  get title() { return this.find((element) => element.localName === 'title')?.textContent.trim() ?? ''; }

  get activeElement() {
    const element = this.focused;
    return element && element.isConnected ? element : this.body;
  }

  createElement(tag) { return new Element(this, tag); }

  createTextNode(text) { return new Text(this, String(text)); }

  elements() {
    const list = [];
    const walk = (node) => { if (node.nodeType === 1) { list.push(node); node.childNodes.forEach(walk); } };
    if (this.documentElement) walk(this.documentElement);
    return list;
  }

  find(test) { return this.elements().find(test) ?? null; }

  getElementById(id) { return this.find((element) => element.id === id && id !== ''); }

  // The sequential focus navigation order: natively focusable elements and tabindex >= 0, in document order.
  tabOrder() { return this.elements().filter((element) => element.focusable() && element.tabIndex >= 0); }
}

function parseHtml(html) {
  const document = new Document();
  const stack = [];
  let root = null;
  const open = (tag, attributes, selfClosed) => {
    const element = document.createElement(tag);
    for (const match of attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      element.setAttribute(match[1], decode(match[2] ?? match[3] ?? match[4] ?? ''));
    }
    if (stack.length) stack.at(-1).attach(element); else root = element;
    if (!VOID.has(tag) && !selfClosed) stack.push(element);
  };
  for (const [token] of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>|[^<]+/g)) {
    if (token.startsWith('<!')) continue;
    const tag = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)([^>]*?)(\/?)>$/.exec(token);
    if (!tag) {
      if (token.trim() && stack.length) stack.at(-1).attach(document.createTextNode(decode(token)));
    } else if (tag[1]) stack.pop();
    else open(tag[2].toLowerCase(), tag[3], tag[4] === '/');
  }
  document.documentElement = root;
  return document;
}

function enterTarget(document, target) {
  const tag = target.localName;
  if (tag === 'button' || (tag === 'a' && target.hasAttribute('href'))) return target.click();
  const form = tag === 'input' ? target.closest('form') : null;
  const submit = form?.elements?.().find((item) => ['button', 'input'].includes(item.localName) && (item.getAttribute('type') ?? 'submit') === 'submit');
  return submit?.click();
}

// One key press with the browser defaults a keyboard user relies on; the page may cancel them with preventDefault().
function press(document, key, { shift = false } = {}) {
  const target = document.activeElement;
  const event = new Event('keydown', { bubbles: true, key, shiftKey: shift });
  target.dispatchEvent(event);
  if (event.defaultPrevented) return event;
  if (key === 'Tab') {
    const order = document.tabOrder();
    const everything = document.elements();
    const here = everything.indexOf(target);
    const after = order.filter((element) => everything.indexOf(element) > here);
    const before = order.filter((element) => everything.indexOf(element) < here);
    const next = shift ? (before.at(-1) ?? order.at(-1)) : (after[0] ?? order[0]);
    next?.focus();
  } else if (key === 'Enter') enterTarget(document, target);
  else if (key === ' ' && target.localName === 'button') target.click();
  else if (target.localName === 'select' && (key === 'ArrowDown' || key === 'ArrowUp')) {
    const values = target.children.map((option) => option.getAttribute('value'));
    const index = Math.min(values.length - 1, Math.max(0, values.indexOf(target.value) + (key === 'ArrowDown' ? 1 : -1)));
    target.value = values[index];
    target.dispatchEvent(new Event('change', { bubbles: true, cancelable: false }));
  }
  return event;
}

function type(element, text) {
  element.value = text;
  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: false }));
}

// A fetch that performs a real loopback HTTP exchange: the page is driven against the real service.
function networkFetch(port) {
  return (route, options = {}) => new Promise((resolve, reject) => {
    const payload = options.body === undefined ? null : Buffer.from(options.body);
    const headers = { ...(options.headers ?? {}), ...(payload ? { 'Content-Length': payload.length } : {}) };
    const request = http.request({ host: '127.0.0.1', port, method: options.method ?? 'GET', path: route, agent: false, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: response.statusCode, ok: response.statusCode >= 200 && response.statusCode < 300, text: async () => text, json: async () => JSON.parse(text) });
      });
    });
    request.on('error', reject);
    request.end(payload);
  });
}

// Runs the scripts named by the real index.html in order; `resolve` maps a script URL path to a file in the repository.
// `skip` leaves named scripts out and `globals` pre-defines their replacements (a fake collaborator) before the others run.
// Each script is compiled once per process and run in every fresh context.
const compiled = new Map();

function loadPage({ html, resolve, fetch, document = parseHtml(html), globals = {}, skip = [] }) {
  const context = vm.createContext({ document, fetch, console, setTimeout, clearTimeout, AbortController, ...globals });
  const loaded = [];
  for (const element of document.elements().filter((item) => item.localName === 'script' && item.src && !skip.includes(item.src))) {
    const file = resolve(element.src);
    if (!compiled.has(file)) compiled.set(file, new vm.Script(fs.readFileSync(file, 'utf8'), { filename: pathToFileURL(file).href }));
    compiled.get(file).runInContext(context);
    loaded.push(path.basename(file));
  }
  return { document, context, loaded };
}

// Quiescence by polling the page's own programmatic busy flag; a hard bound makes a stuck page fail instead of hanging.
async function idle(document, { limit = 20000 } = {}) {
  for (let turn = 0; turn < limit; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    if (!document.elements().some((element) => element.getAttribute('aria-busy') === 'true')) {
      await new Promise((resolve) => setImmediate(resolve));
      return;
    }
  }
  throw new Error('IDLE_BOUND_EXCEEDED: the page stayed busy');
}

Element.prototype.elements = function elementsBelow() {
  const list = [];
  const walk = (node) => { if (node.nodeType === 1) { list.push(node); node.childNodes.forEach(walk); } };
  this.childNodes.forEach(walk);
  return list;
};

module.exports = { Document, Event, idle, loadPage, networkFetch, parseHtml, press, type };
