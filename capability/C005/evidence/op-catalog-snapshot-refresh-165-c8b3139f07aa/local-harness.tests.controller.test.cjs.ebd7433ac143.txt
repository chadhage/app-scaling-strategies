'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const catalog = require('../../C005/catalog-data.js');
const matrix = require('../../C003/matrix-data.js');
const page = require('../catalog-page.js');
const { documentFixture, descendants, settled } = require('./dom-fixture.cjs');

function closed(doc) {
  for (const id of ['matching-entries', 'excluded-entries', 'preparation-body', 'snapshot-body']) {
    assert.equal(doc.getElementById(id).children.length, 0, id);
    assert.equal(doc.getElementById(id).textContent, '', id);
  }
  for (const id of ['snapshot', 'preparation', 'excluded']) assert.equal(doc.getElementById(id).hidden, true, id);
}

test('real controller mounts all original IDs and shared C007 option vocabularies', async () => {
  const doc = documentFixture();
  const controller = page.mount(catalog, matrix, doc);
  assert.equal(await controller.ready, true);
  assert.deepEqual(doc.getElementById('matching-entries').children.map(node => node.id), catalog.entries.map(entry => entry.id));
  assert.match(doc.getElementById('snapshot-body').textContent, new RegExp(catalog.acceptanceSnapshot.commit));
  for (const [id, values] of [
    ['host-filter', Object.keys(require('../../C007/catalog-filters.js').HOST_LABELS)],
    ['risk-filter', require('../../C007/catalog-filters.js').RISKS],
    ['readiness-filter', require('../../C007/catalog-filters.js').READINESS]
  ]) assert.deepEqual(doc.getElementById(id).children.map(node => node.value), values);
  assert.equal(doc.getElementById('preparation').hidden, true);
});

test('the actual query plus three filters flows into exact preparation and a preserved accepted lesson link', async () => {
  const doc = documentFixture();
  const controller = page.mount(catalog, matrix, doc);
  await controller.ready;
  doc.getElementById('catalog-query').value = 'blue-green';
  for (const [id, value] of [['host-filter', 'aks'], ['risk-filter', 'unclassified'], ['readiness-filter', 'portable-available']]) {
    doc.getElementById(id).value = value;
  }
  assert.equal(await controller.refresh(), true);
  assert.deepEqual(doc.getElementById('matching-entries').children.map(node => node.id), ['S001', 'S128']);
  assert.deepEqual(doc.getElementById('excluded-entries').children.map(node => node.id), ['S124']);
  assert.equal(await controller.open('S001'), true);
  assert.equal(doc.activeElement.id, 'preparation-heading');
  const body = doc.getElementById('preparation-body');
  for (const value of [catalog.entries[0].objective, catalog.entries[0].implementation, catalog.entries[0].acceptance]) {
    assert.ok(body.textContent.includes(value));
  }
  for (const key of ['dependencyRules', 'operatingLimits', 'sharedDefinitionOfDone', 'acceptanceAndEvidence']) {
    assert.ok(body.textContent.includes(catalog.common[key].text), key);
  }
  assert.match(body.textContent, /also inherits BASE/);
  assert.match(body.textContent, /Unknown target support for AKS/);
  const lesson = descendants(body, 'a').find(node => node.className === 'lesson-link');
  assert.equal(lesson.attributes.get('href'), catalog.entries[0].learning.href);
  assert.equal(lesson.target, '_blank');
  assert.equal(lesson.rel, 'noopener noreferrer');
  controller.back();
  assert.equal(doc.getElementById('preparation').hidden, true);
  assert.equal(doc.getElementById('catalog-query').value, 'blue-green');
  assert.equal(doc.getElementById('host-filter').value, 'aks');
  assert.equal(doc.activeElement.id, 'prepare-S001');
});

test('host exclusions preserve preparation, while no-result transitions clear stale preparation synchronously', async () => {
  const doc = documentFixture();
  const controller = page.mount(catalog, matrix, doc);
  await controller.ready;
  doc.getElementById('catalog-query').value = catalog.entries[1].title;
  doc.getElementById('host-filter').value = 'aks';
  doc.getElementById('readiness-filter').value = 'portable-available';
  await controller.refresh();
  assert.equal(doc.getElementById('matching-entries').children.length, 0);
  assert.deepEqual(doc.getElementById('excluded-entries').children.map(node => node.id), ['S002']);
  await controller.open('S002');
  assert.ok(descendants(doc.getElementById('preparation-body'), 'a').some(node => node.className === 'lesson-link'));
  doc.getElementById('catalog-query').value = 'op-catalog-never-matches';
  const pending = controller.refresh();
  closed(doc);
  await pending;
  assert.equal(doc.getElementById('catalog-empty').hidden, false);
  assert.equal(doc.getElementById('catalog-error').hidden, true);
  assert.equal(doc.getElementById('preparation').hidden, true);
  assert.equal(await controller.reset(), true);
  assert.equal(doc.getElementById('catalog-query').value, '');
  assert.equal(doc.getElementById('host-filter').value, 'all');
  assert.equal(doc.getElementById('matching-entries').children.length, 152);
  assert.equal(doc.activeElement.id, 'catalog-query');
});

test('invalid replacement data clears claims and cannot revive an earlier valid mount on input or reset', async () => {
  const doc = documentFixture();
  const original = page.mount(catalog, matrix, doc);
  await original.ready;
  await original.open('S001');
  const rejected = page.mount(null, matrix, doc);
  closed(doc);
  assert.equal(await rejected.ready, false);
  assert.equal(doc.getElementById('catalog-error').hidden, false);
  assert.equal(doc.getElementById('catalog-query').handlers.get('input').size, 1);
  assert.equal(doc.getElementById('host-filter').handlers.get('change').size, 1);
  doc.getElementById('catalog-query').emit('input');
  await settled(doc);
  closed(doc);
  const event = doc.getElementById('catalog-form').emit('reset');
  assert.equal(event.prevented, true);
  await settled(doc);
  closed(doc);
  assert.equal(doc.getElementById('catalog-error').hidden, false);
  const recovered = page.mount(catalog, matrix, doc);
  assert.equal(await recovered.ready, true);
  assert.equal(doc.getElementById('matching-entries').children.length, 152);
});

test('literal query and source markup are text nodes, not executable or interpreted markup', async () => {
  const doc = documentFixture();
  const fixture = structuredClone(catalog);
  const literal = '<img src=x onerror="globalThis.injected=true"> & <script>literal.*</script>';
  fixture.entries[0].title = literal;
  fixture.entries[0].objective = literal;
  const controller = page.mount(fixture, matrix, doc);
  await controller.ready;
  doc.getElementById('catalog-query').value = '<script>literal.*</script>';
  await controller.refresh();
  assert.equal(doc.getElementById('matching-entries').children.length, 1);
  assert.ok(doc.getElementById('matching-entries').textContent.includes(literal));
  assert.ok(doc.getElementById('catalog-status').textContent.includes('<script>literal.*</script>'));
  assert.equal(descendants(doc.getElementById('matching-entries'), 'img').length, 0);
  assert.equal(descendants(doc.getElementById('matching-entries'), 'script').length, 0);
  await controller.open('S001');
  assert.ok(doc.getElementById('preparation-body').textContent.includes(literal));
});

function delayedPage(hold) {
  const actual = require('../composition.js');
  const sandbox = {
    module: { exports: {} },
    require(name) {
      if (name === './composition.js') return {
        async compose(data, authority, request) {
          const result = await actual.compose(data, authority, {
            query: request.query, filters: { ...request.filters }, entryId: request.entryId
          });
          if (request.entryId === 'S001') await hold;
          return result;
        }
      };
      return require(path.resolve(__dirname, '..', name));
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'catalog-page.js'), 'utf8'), sandbox);
  return sandbox.module.exports;
}

test('a slow previous preparation cannot overwrite a newer query or reset', async () => {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const doc = documentFixture();
  const controller = delayedPage(hold).mount(catalog, matrix, doc);
  await controller.ready;
  const previous = controller.open('S001');
  doc.getElementById('catalog-query').value = 'no-current-match';
  await controller.refresh();
  release();
  assert.equal(await previous, false);
  assert.equal(doc.getElementById('catalog-empty').hidden, false);
  assert.equal(doc.getElementById('preparation').hidden, true);
  assert.equal(doc.getElementById('matching-entries').children.length, 0);
  await controller.reset();
  assert.equal(doc.activeElement.id, 'catalog-query');
});

test('disposing / replacing a mount cancels pending work and detaches only its handlers', async () => {
  let release;
  const doc = documentFixture();
  const held = delayedPage(new Promise(resolve => { release = resolve; })).mount(catalog, matrix, doc);
  await held.ready;
  const pending = held.open('S001');
  held.dispose();
  const next = page.mount(undefined, matrix, doc);
  await next.ready;
  release();
  assert.equal(await pending, false);
  closed(doc);
  assert.equal(doc.getElementById('catalog-query').handlers.get('input').size, 1);
  assert.equal(doc.getElementById('catalog-error').hidden, false);
});

test('retained disposed controllers cannot clear or reset a later valid mount', async () => {
  const doc = documentFixture();
  const previous = page.mount(catalog, matrix, doc);
  await previous.ready;
  const current = page.mount(catalog, matrix, doc);
  await current.ready;
  doc.getElementById('catalog-query').value = 'blue-green';
  await current.refresh();
  const before = doc.getElementById('catalog-status').textContent;
  assert.equal(await previous.refresh(), false);
  assert.equal(await previous.reset(), false);
  previous.back();
  previous.dispose();
  assert.equal(doc.getElementById('catalog-query').value, 'blue-green');
  assert.equal(doc.getElementById('catalog-status').textContent, before);
  assert.deepEqual(doc.getElementById('matching-entries').children.map(node => node.id), ['S001', 'S124', 'S128']);
});
