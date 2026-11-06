'use strict';

// Test tooling, not production code: a minimal DOM whose elements come from the real index.html, so the
// browser-only page.js (and the UMD scripts it needs) run under Node and are measured instead of excluded.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

class FakeElement {
  constructor(id, tagName, { disabled = false, value = '' } = {}) {
    Object.assign(this, { id, tagName, textContent: '', value, disabled, focusCount: 0, listeners: new Map() });
  }

  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) || []), listener]); }

  focus() { this.focusCount += 1; }

  async click() { if (!this.disabled) await this.forceClick(); }

  // A disabled control never receives a click in a browser; forceClick reaches the handler's defensive guard.
  async forceClick() { for (const listener of this.listeners.get('click') || []) await listener({ type: 'click' }); }
}

function createDocument(html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')) {
  const elements = new Map();
  const selects = new Map([...html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)]
    .map(([, id, body]) => [id, [...body.matchAll(/<option\b[^>]*\bvalue="([^"]*)"/g)].map((match) => match[1])]));
  for (const [, tagName, attributes, content] of html.matchAll(/<(\w+)\b([^>]*)>([^<]*)/g)) {
    const id = /\bid="([^"]+)"/.exec(attributes);
    if (id) {
      const element = new FakeElement(id[1], tagName, { disabled: /\bdisabled\b/.test(attributes), value: selects.has(id[1]) ? selects.get(id[1])[0] : '' });
      element.textContent = content.trim();
      elements.set(id[1], element);
    }
  }
  const jar = new Map();
  const document = {
    elements, writes: [], requested: new Set(),
    getElementById(id) { document.requested.add(id); return elements.get(id) || null; },
    element(id) {
      if (!elements.has(id)) throw new Error(`NO_SUCH_ELEMENT_IN_INDEX_HTML ${id}`);
      return elements.get(id);
    },
    get cookie() { return [...jar].map(([name, value]) => `${name}=${value}`).join('; '); },
    set cookie(text) {
      document.writes.push(text);
      const [pair, ...attributes] = text.split(';');
      const [name, ...value] = pair.split('=');
      if (attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute))) jar.delete(name.trim());
      else jar.set(name.trim(), value.join('=').trim());
    }
  };
  return document;
}

function load(context, file) {
  const filename = path.join(root, file);
  return new vm.Script(fs.readFileSync(filename, 'utf8'), { filename: pathToFileURL(filename).href }).runInContext(context);
}

// Runs the scripts in the real index.html order; a file URL as the script name lets Node coverage see the real files.
async function runPage({ fetch, document = createDocument(), skip = [] } = {}) {
  const context = vm.createContext({ document, fetch });
  for (const file of ['contract.js', 'client.js', 'page.js']) if (!skip.includes(file)) load(context, file);
  await new Promise((resolve) => setImmediate(resolve));
  return { document, context };
}

module.exports = Object.freeze({ FakeElement, createDocument, runPage });
