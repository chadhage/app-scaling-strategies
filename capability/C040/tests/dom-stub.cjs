'use strict';

const fs = require('node:fs');
const path = require('node:path');

class StubElement {
  constructor(document, tag) {
    Object.assign(this, { document, tag, id: '', dataset: {}, attributes: new Map(), children: [], listeners: new Map(), textContent: '', value: '',
      disabled: false, className: '', label: '', scope: '' });
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  focus() { this.document.activeElement = this; }
  dispatch(type, event = {}) { this.listeners.get(type)(event); }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
}
// One element per id found in the real index.html, so the page script and its markup must agree. Static attributes are parsed too.
function createDocument(html) {
  const document = { activeElement: null, elements: new Map() };
  for (const match of html.matchAll(/<(\w+)\b([^>]*)>/g)) {
    const id = /\sid="([^"]+)"/.exec(match[2])?.[1];
    if (!id) continue;
    const element = new StubElement(document, match[1]);
    element.id = id;
    element.disabled = /\sdisabled(?:\s|$)/.test(match[2]);
    for (const attribute of match[2].matchAll(/\s(aria-[a-z]+|tabindex|role)="([^"]*)"/g)) element.attributes.set(attribute[1], attribute[2]);
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
