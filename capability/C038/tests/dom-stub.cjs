'use strict';

// Test tooling, not production code: a minimal DOM whose elements come from the real index.html,
// so page.js can run under Node and be measured instead of being excluded from coverage.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
class FakeElement {
  constructor(document, id, tagName) {
    Object.assign(this, { document, id, tagName, textContent: '', value: '', disabled: false,
      dataset: {}, children: [], listeners: new Map(), focusCount: 0, selected: false });
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  focus() { this.document.activeElement = this; this.focusCount += 1; }
  select() { this.selected = true; }
  async click() { if (!this.disabled) await this.forceClick(); }
  // A disabled control never receives a click in a browser; forceClick reaches defensive handler guards directly.
  async forceClick() { for (const listener of this.listeners.get('click') ?? []) await listener({ type: 'click' }); }
}
function createDocument(html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')) {
  const elements = new Map();
  const document = {
    elements, activeElement: null, requested: new Set(),
    getElementById(id) { document.requested.add(id); return elements.get(id) ?? null; },
    createElement(tagName) { return new FakeElement(document, null, tagName); },
    element(id) {
      if (!elements.has(id)) throw new Error(`NO_SUCH_ELEMENT_IN_INDEX_HTML ${id}`);
      return elements.get(id);
    }
  };
  for (const match of html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"/g)) elements.set(match[2], new FakeElement(document, match[2], match[1]));
  return document;
}
async function runPage(readiness, document = createDocument()) {
  const file = path.join(root, 'page.js');
  const context = vm.createContext({ document, C038Readiness: readiness });
  // A file URL as the script name lets Node coverage attribute the run to the real page.js.
  await new vm.Script(fs.readFileSync(file, 'utf8'), { filename: pathToFileURL(file).href }).runInContext(context);
  return document;
}
module.exports = Object.freeze({ FakeElement, createDocument, runPage });
