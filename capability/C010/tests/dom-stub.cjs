'use strict';

// Test tooling, not production code: a minimal DOM whose elements come from the real index.html, so page.js runs under Node and is measured
// (L-0044, L-0053). Markup and script must agree: an id the script asks for that index.html does not declare throws instead of yielding null.
// C010_SUBJECT_DIR lets a replay load another page.js; the markup is always the real index.html.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const rootDir = path.resolve(__dirname, '..');
const subjectDir = process.env.C010_SUBJECT_DIR ? path.resolve(process.env.C010_SUBJECT_DIR) : rootDir;

class FakeElement {
  constructor(document, id, tagName) {
    Object.assign(this, { document, id, tagName, textContent: '', value: '', children: [], attributes: {}, listeners: new Map() });
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
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

async function runPage({ fetch, document = createDocument() }) {
  const file = path.join(subjectDir, 'page.js');
  const context = vm.createContext({ document, fetch });
  // A file URL as the script name lets Node coverage attribute the run to the real page.js.
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: pathToFileURL(file).href }).runInContext(context);
  await flush();
  return { document, context };
}

module.exports = Object.freeze({ FakeElement, createDocument, flush, runPage, rootDir, subjectDir });
