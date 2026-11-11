'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
function browser(sources, options = {}) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), elements = new Map(), callbacks = new Map();
  let document;
  class Element {
    constructor(id = '') { this.id = id; this.value = ''; this.disabled = id === 'acknowledge'; this.checked = false; this.children = []; this.attributes = {}; this._text = ''; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this.children = children; this._text = ''; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(type, callback) { const key = this.id + ':' + type; callbacks.set(key, [...callbacks.get(key) || [], callback]); }
    focus() { document.activeElement = this; }
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1], new Element(match[1]));
  elements.get('scenario').value = 'held';
  document = { documentElement: new Element(), activeElement: null,
    getElementById: id => elements.get(id) || null, createElement: () => new Element() };
  const context = vm.createContext({ document, window: { location: { search: options.search || '' }, matchMedia: () => ({ matches: Boolean(options.dark) }) },
    URLSearchParams, TextEncoder, Uint8Array, crypto: options.cryptoUnavailable ? {} : crypto.webcrypto, console });
  const reads = [], faults = [];
  function run(file) {
    const text = sources[file];
    const digest = crypto.createHash('sha256').update(text).digest('hex');
    reads.push({ file, readSha256: digest, executedSha256: digest });
    try { new vm.Script(text, { filename: pathToFileURL(path.join(root, file.split('#')[0])).href }).runInContext(context, { timeout: 10000 }); }
    catch (error) { faults.push({ phase: 'initialization', file, name: error.name, code: error.code || null, message: error.message }); }
  }
  async function emit(id, type) {
    const output = { id, type, callbacks: (callbacks.get(id + ':' + type) || []).length, completed: true, fault: null };
    try { for (const callback of callbacks.get(id + ':' + type) || []) await callback({ target: elements.get(id) }); }
    catch (error) {
      output.completed = false;
      output.fault = { phase: 'event', id, type, name: error.name, code: error.code || null, message: error.message };
      faults.push(output.fault);
    }
    return output;
  }
  function snapshot() {
    return { fields: Object.fromEntries(['packet', 'owner', 'reservation-id', 'as-of'].map(id => [id, elements.get(id).value])),
      rows: elements.get('facts').children.map(row => [row.attributes['data-fact'] || null, ...row.children.map(cell => cell.textContent)]),
      status: elements.get('status').textContent, checked: elements.get('acknowledge').checked,
      disabled: elements.get('acknowledge').disabled, reviewDisabled: elements.get('review').disabled,
      theme: document.documentElement.attributes['data-theme'] || null };
  }
  return { context, elements, document, callbacks, run, emit, snapshot, reads, faults };
}
function cjs(source, file) {
  const requireActual = require('node:module').createRequire(path.join(root, file));
  const box = { module: { exports: {} }, TextEncoder, console, require: requireActual };
  let fault = null;
  try { new vm.Script(source, { filename: pathToFileURL(path.join(root, file)).href }).runInNewContext(box, { timeout: 10000 }); }
  catch (error) { fault = { phase: 'initialization', file, name: error.name, code: error.code || null, message: error.message }; }
  const digest=crypto.createHash('sha256').update(source).digest('hex');
  return { api: box.module.exports, fault, execution:{file,readSha256:digest,executedSha256:digest} };
}
module.exports = { browser, cjs, root };
