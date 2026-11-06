'use strict';

const fs = require('node:fs');
const path = require('node:path');

class StubElement {
  constructor(document, tag) {
    Object.assign(this, { document, tag, dataset: {}, children: [], listeners: new Map(), textContent: '', value: '',
      disabled: false, className: '' });
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  focus() { this.document.activeElement = this; }
  dispatch(type) { this.listeners.get(type)(); }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
}
// One element per id found in the real index.html, so the page script and its markup must agree.
function createDocument(html) {
  const document = { activeElement: null, elements: new Map() };
  for (const match of html.matchAll(/<(\w+)\b([^>]*)>/g)) {
    const id = /\sid="([^"]+)"/.exec(match[2])?.[1];
    if (!id) continue;
    const element = new StubElement(document, match[1]);
    element.disabled = /\sdisabled(?:\s|$)/.test(match[2]);
    for (const attribute of match[2].matchAll(/\sdata-([a-z-]+)="([^"]*)"/g)) {
      element.dataset[attribute[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = attribute[2];
    }
    document.elements.set(id, element);
  }
  document.getElementById = (id) => document.elements.get(id);
  document.createElement = (tag) => new StubElement(document, tag);
  return document;
}
module.exports = Object.freeze({ StubElement, createDocument, html: fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8') });
