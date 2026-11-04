'use strict';

const fs = require('node:fs');
const path = require('node:path');

class Node {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.handlers = new Map();
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this._text = '';
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this._text = ''; this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith('data-')) delete this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
  }
  addEventListener(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.handlers.get(type)?.delete(handler); }
  emit(type) {
    const event = { preventDefault() { this.prevented = true; }, prevented: false };
    for (const handler of this.handlers.get(type) || []) handler(event);
    return event;
  }
  focus() { this.ownerDocument.activeElement = this; }
}

function documentFixture() {
  const doc = { nodes: [], activeElement: null };
  doc.createElement = tag => new Node(doc, tag);
  doc.getElementById = id => {
    function find(nodes) {
      for (const node of nodes) {
        if (node.id === id) return node;
        const found = find(node.children);
        if (found) return found;
      }
      return null;
    }
    return find(doc.nodes);
  };
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
    const node = doc.createElement(match[1]);
    node.id = match[2];
    node.hidden = /\bhidden\b/.test(match[0]);
    node.disabled = /\bdisabled\b/.test(match[0]);
    if (node.tagName === 'select') node.value = 'all';
    doc.nodes.push(node);
  }
  return doc;
}

function descendants(node, tag) {
  return node.children.flatMap(child => [
    ...(child.tagName === tag ? [child] : []), ...descendants(child, tag)
  ]);
}

async function settled(doc) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!doc.getElementById('catalog-status').textContent.startsWith('Validating')) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Controller did not settle.');
}

module.exports = { documentFixture, descendants, settled };
