'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const T = require('..\\tables.js');
const saved = require('..\\saved.js');
const r = require('.\\reports.cjs');

const root = path.resolve(__dirname, '..');
const roundTrip = (value) => JSON.parse(JSON.stringify(value));

// The browser-global branch of a UMD file runs the real source in a fresh context without module or require (L-0102),
// so the page's own loading path is measured and exercised, not only the CommonJS path.
function asBrowser(name) {
  const file = path.join(root, name);
  const context = vm.createContext({});
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: pathToFileURL(file).href }).runInContext(context);
  return context;
}

test('tables.js defines the read-only browser global C040Tables when it runs without module or require', () => {
  const context = asBrowser('tables.js');
  const api = context.C040Tables;
  assert.deepEqual(Object.keys(api).sort(), Object.keys(T).sort());
  assert.deepEqual(Object.getOwnPropertyDescriptor(context, 'C040Tables'), { value: api, writable: false, enumerable: false, configurable: false });
  const view = api.view(api.fromCohort(r.cohortReport(['transition', 'failed', 'unknown'])), { filter: 'success' });
  assert.deepEqual([view.shown, view.keptVisible.count, view.state], [3, 2, 'COMPLETE']);
  assert.equal(api.banner, T.banner);
});

test('saved.js defines the deeply frozen browser global C040Saved, equal to the module bundle, when it runs without module or require', () => {
  const context = asBrowser('saved.js');
  assert.deepEqual(roundTrip(context.C040Saved), roundTrip(saved));
  assert.ok(Object.isFrozen(context.C040Saved) && Object.isFrozen(context.C040Saved.sets[0].reports.cohort.output.clients[0]));
  assert.deepEqual(Object.getOwnPropertyDescriptor(context, 'C040Saved').writable, false);
  const catalog = T.catalog(context.C040Saved);
  assert.equal(catalog.ids.length, 8);
  assert.equal(T.view(catalog.tables('closed-history').cohort).state, 'COMPLETE');
});

test('the page globals load in the order of index.html and build the same tables as the CommonJS modules', () => {
  const context = vm.createContext({});
  for (const name of ['tables.js', 'saved.js']) {
    const file = path.join(root, name);
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: pathToFileURL(file).href }).runInContext(context);
  }
  const catalog = context.C040Tables.catalog(context.C040Saved);
  for (const id of catalog.ids) {
    for (const tableId of T.tableIds) {
      const inBrowser = context.C040Tables.view(catalog.tables(id)[tableId]);
      const inNode = T.view(T.catalog(saved).tables(id)[tableId]);
      assert.deepEqual(roundTrip(inBrowser.statusCounts), roundTrip(inNode.statusCounts), `${id} ${tableId}`);
      assert.equal(inBrowser.summary, inNode.summary);
    }
  }
});
