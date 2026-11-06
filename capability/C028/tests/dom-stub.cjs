'use strict';

// Test tooling, not production code: a minimal DOM whose elements come from the real index.html, so page.js runs under
// Node and is measured by coverage instead of being excluded.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

class FakeElement {
  constructor(document, id, tagName) {
    Object.assign(this, { document, id, tagName, textContent: '', className: '', disabled: false, children: [], listeners: new Map() });
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  async click() {
    if (!this.disabled) await this.forceClick();
  }

  // A disabled control never receives a click in a browser; forceClick reaches the handler's own guard directly.
  async forceClick() {
    for (const listener of this.listeners.get('click') ?? []) await listener({ type: 'click' });
  }

  text() {
    return [this.textContent, ...this.children.map((child) => child.text())].join(' ');
  }
}

function createDocument(html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')) {
  const elements = new Map();
  const document = {
    elements,
    requested: new Set(),
    getElementById(id) {
      document.requested.add(id);
      return elements.get(id) ?? null;
    },
    createElement(tagName) {
      return new FakeElement(document, null, tagName);
    },
    element(id) {
      if (!elements.has(id)) throw new Error(`NO_SUCH_ELEMENT_IN_INDEX_HTML ${id}`);
      return elements.get(id);
    }
  };
  for (const match of html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"/g)) elements.set(match[2], new FakeElement(document, match[2], match[1]));
  return document;
}

function runPage({ fetch, document = createDocument() } = {}) {
  const file = path.join(root, 'page.js');
  const context = vm.createContext({ document, fetch });
  // A file URL as the script name lets Node coverage attribute the run to the real page.js.
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: pathToFileURL(file).href }).runInContext(context);
  return { document, context };
}

module.exports = Object.freeze({ FakeElement, createDocument, runPage });
