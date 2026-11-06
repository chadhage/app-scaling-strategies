'use strict';

// Test tooling, not production code: a small DOM built from real HTML (elements, text nodes, attributes, events with
// bubbling, focus, the sequential Tab order and the default actions of keys) so page.js and a11y-check.js run under Node
// in a vm context and are measured. Live-region writes are logged: that log is how "announced exactly once" is tested.
const VOID = new Set(['meta', 'link', 'input', 'br', 'img', 'hr']);
const NATIVE = new Set(['button', 'input', 'select', 'textarea', 'iframe', 'summary']);
const LIVE_ROLES = new Set(['status', 'alert', 'log']);
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': '\u00a0' };

class Event {
  constructor(type, init = {}) {
    Object.assign(this, { type, bubbles: false, cancelable: true, defaultPrevented: false, target: null, currentTarget: null }, init);
  }

  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
}

class Node {
  constructor(document) {
    this.ownerDocument = document;
    this.parentNode = null;
    this.childNodes = [];
    this.listeners = new Map();
  }

  get children() { return this.childNodes.filter((node) => node.nodeType === 1); }

  get isConnected() { let node = this; while (node.parentNode) node = node.parentNode; return node === this.ownerDocument.documentElement; }

  contains(other) { for (let node = other; node; node = node.parentNode) if (node === this) return true; return false; }

  get textContent() { return this.childNodes.map((node) => node.textContent).join(''); }

  set textContent(value) { this.replaceChildren(...(String(value) === '' ? [] : [this.ownerDocument.createTextNode(String(value))])); }

  appendChild(node) { this.attach(node); this.changed(); return node; }

  append(...nodes) {
    nodes.forEach((node) => this.attach(typeof node === 'string' ? this.ownerDocument.createTextNode(node) : node));
    this.changed();
  }

  attach(node) {
    node.parentNode?.detach(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }

  detach(node) { this.childNodes.splice(this.childNodes.indexOf(node), 1); node.parentNode = null; }

  removeChild(node) { this.detach(node); this.changed(); return node; }

  remove() { this.parentNode?.removeChild(this); }

  replaceChildren(...nodes) {
    for (const node of this.childNodes) node.parentNode = null;
    this.childNodes = [];
    nodes.forEach((node) => this.attach(typeof node === 'string' ? this.ownerDocument.createTextNode(node) : node));
    this.changed();
  }

  // A write below a live region is one announcement, recorded with the text the region then holds.
  changed() {
    for (let node = this; node && node.nodeType === 1; node = node.parentNode) {
      if (node.live()) this.ownerDocument.announcements.push({ element: node, text: node.textContent });
    }
  }

  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }

  dispatchEvent(event) {
    event.target ??= this;
    for (let node = this; node; node = event.bubbles ? node.parentNode : null) {
      event.currentTarget = node;
      for (const listener of node.listeners.get(event.type) ?? []) listener.call(node, event);
    }
    return !event.defaultPrevented;
  }
}

class Text extends Node {
  constructor(document, data) { super(document); this.nodeType = 3; this.data = data; }

  get textContent() { return this.data; }

  set textContent(value) { this.data = String(value); }
}

class Element extends Node {
  constructor(document, tag) {
    super(document);
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.state = { value: null, checked: false };
  }

  get localName() { return this.tagName.toLowerCase(); }

  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }

  hasAttribute(name) { return this.attrs.has(name); }

  setAttribute(name, value) { this.attrs.set(name, String(value)); }

  removeAttribute(name) { this.attrs.delete(name); }

  get id() { return this.getAttribute('id') ?? ''; }

  set id(value) { this.setAttribute('id', value); }

  get className() { return this.getAttribute('class') ?? ''; }

  set className(value) { this.setAttribute('class', value); }

  get hidden() { return this.hasAttribute('hidden'); }

  set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }

  get disabled() { return this.hasAttribute('disabled'); }

  set disabled(value) { if (value) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }

  get title() { return this.getAttribute('title') ?? ''; }

  set title(value) { this.setAttribute('title', value); }

  get src() { return this.getAttribute('src') ?? ''; }

  set src(value) { this.setAttribute('src', value); }

  get value() {
    if (this.state.value !== null) return this.state.value;
    if (this.localName === 'select') return (this.children.find((option) => option.hasAttribute('selected')) ?? this.children[0])?.getAttribute('value') ?? '';
    return this.getAttribute('value') ?? '';
  }

  set value(value) { this.state.value = String(value); }

  get checked() { return this.state.checked; }

  set checked(value) { this.state.checked = Boolean(value); }

  get tabIndex() {
    const given = Number.parseInt(this.getAttribute('tabindex') ?? '', 10);
    if (Number.isInteger(given)) return given;
    return this.nativelyFocusable() ? 0 : -1;
  }

  nativelyFocusable() {
    const tag = this.localName;
    if (tag === 'input') return this.getAttribute('type') !== 'hidden' && !this.disabled;
    if (tag === 'select' || tag === 'textarea' || tag === 'button') return !this.disabled;
    return NATIVE.has(tag) || (tag === 'a' && this.hasAttribute('href'));
  }

  live() { return this.hasAttribute('aria-live') || LIVE_ROLES.has(this.getAttribute('role')); }

  focusable() {
    if (!this.isConnected || this.disabled) return false;
    for (let node = this; node && node.nodeType === 1; node = node.parentNode) if (node.hidden) return false;
    return this.nativelyFocusable() || Number.isInteger(Number.parseInt(this.getAttribute('tabindex') ?? '', 10));
  }

  focus() {
    const document = this.ownerDocument;
    if (!this.focusable() || document.activeElement === this) return;
    const previous = document.activeElement;
    document.focused = this;
    previous.dispatchEvent(new Event('blur', { cancelable: false }));
    this.dispatchEvent(new Event('focus', { cancelable: false }));
    this.dispatchEvent(new Event('focusin', { bubbles: true, cancelable: false }));
  }

  blur() { if (this.ownerDocument.focused === this) this.ownerDocument.focused = null; }

  click() {
    if (this.disabled) return;
    const event = new Event('click', { bubbles: true });
    this.dispatchEvent(event);
    if (event.defaultPrevented) return;
    const tag = this.localName;
    const form = this.closest('form');
    if (form && (tag === 'button' || tag === 'input') && (this.getAttribute('type') ?? 'submit') === 'submit') form.dispatchEvent(new Event('submit', { bubbles: true }));
    else if (tag === 'a' && /^#./.test(this.getAttribute('href') ?? '')) this.ownerDocument.getElementById(this.getAttribute('href').slice(1))?.focus();
  }

  closest(tag) { for (let node = this; node && node.nodeType === 1; node = node.parentNode) if (node.localName === tag) return node; return null; }
}

module.exports = { ENTITIES, Element, Event, LIVE_ROLES, Node, Text, VOID };
