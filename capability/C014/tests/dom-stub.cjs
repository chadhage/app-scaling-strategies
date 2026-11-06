'use strict';

// Test tooling, not production code: a DOM stub with one element per id of the REAL index.html (so markup and script must agree: an id the script asks for
// that the page does not have throws), enough of the DOM API for page.js, and a vm loader that runs the real script under its file URL so that Node counts
// its coverage (L-0044, L-0053).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SOURCE = fs.readFileSync(path.join(ROOT, 'page.js'), 'utf8');
const IDS = [...HTML.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.textContent = ''; this.className = ''; this.handlers = {}; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, handler) { (this.handlers[type] = this.handlers[type] || []).push(handler); }
  click() { for (const handler of this.handlers.click || []) handler({ type: 'click' }); }
}

function createDocument() {
  const elements = new Map(IDS.map((id) => [id, new Element('stub')]));
  return {
    elements,
    getElementById(id) { if (!elements.has(id)) throw new Error(`the page has no element with id ${id}`); return elements.get(id); },
    createElement: (tag) => new Element(tag)
  };
}

// Every text the page shows: the text of every element and every descendant.
function allText(document) {
  const texts = [];
  const visit = (element) => { texts.push(element.textContent, element.className); element.children.forEach(visit); };
  document.elements.forEach(visit);
  return texts.filter(Boolean).join('\n');
}

// Loads the real page.js into a fresh context. `fetch` is the test's; timers are real unless the test passes its own.
function loadPage({ fetch, setTimeout: timer = setTimeout, clearTimeout: clear = clearTimeout }) {
  const document = createDocument();
  const context = vm.createContext({ document, fetch, AbortController, setTimeout: timer, clearTimeout: clear });
  vm.runInContext(SOURCE, context, { filename: pathToFileURL(path.join(ROOT, 'page.js')).href });
  return { document, context, page: context.C014Page };
}

// Waits (by yielding, never by timer) until the status line leaves its loading text.
async function settled(document) {
  for (let turn = 0; turn < 2000 && document.elements.get('status').textContent === 'Loading evidence.'; turn += 1) await new Promise((resolve) => setImmediate(resolve));
}

module.exports = Object.freeze({ HTML, SOURCE, IDS, Element, createDocument, allText, loadPage, settled });
