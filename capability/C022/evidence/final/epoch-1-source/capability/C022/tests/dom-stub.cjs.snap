'use strict';

// Test tooling, not production code: a minimal DOM whose elements come from the real index.html, so page.js runs under Node and is
// measured (L-0044, L-0053). Markup and script must agree: an id the script asks for that index.html does not declare throws instead of
// yielding null. The page is run with vm.Script and a file URL as its name so that Node coverage attributes the run to the real page.js.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const rootDir = path.resolve(__dirname, '..');

class FakeElement {
  constructor(document, id, tagName) {
    Object.assign(this, { document, id, tagName, textContent: '', value: '', className: '', disabled: false, children: [], listeners: new Map() });
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  async click() { for (const listener of this.listeners.get('click') ?? []) await listener({ type: 'click' }); }
}

function createDocument(html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8')) {
  const elements = new Map();
  const document = {
    elements, requested: new Set(),
    getElementById(id) {
      document.requested.add(id);
      if (!elements.has(id)) throw new Error(`NO_SUCH_ELEMENT_IN_INDEX_HTML ${id}`);
      return elements.get(id);
    },
    createElement(tagName) { return new FakeElement(document, null, tagName); }
  };
  for (const match of html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"[^>]*>([^<]*)/g)) {
    const element = new FakeElement(document, match[2], match[1]);
    element.textContent = match[3].trim();
    elements.set(match[2], element);
  }
  return document;
}

async function flush() {
  for (let turn = 0; turn < 6; turn += 1) await new Promise((resolve) => setImmediate(resolve));
}

function loadPage({ fetch, document = createDocument(), extra = {}, contract = require('../contract.js') }) {
  const file = path.join(rootDir, 'page.js');
  const context = vm.createContext({ document, fetch, C022Contract: contract, ...extra });
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: pathToFileURL(file).href }).runInContext(context);
  return { document, context };
}

module.exports = Object.freeze({ FakeElement, createDocument, flush, loadPage, rootDir });
