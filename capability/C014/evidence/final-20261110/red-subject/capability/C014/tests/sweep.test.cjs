'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { startLocal } = require('../server.cjs');
const stub = require(path.join(__dirname, '..', 'evidence', 'red', 'stubs', 'server.cjs'));
const { createService } = require('../service.cjs');
const { seedConfig, canaryList } = require('./canaries.cjs');
const { ENCODERS, scan } = require('./scanner.cjs');
const { PLACES, ROUTES, METHODS, runSweep } = require('./sweep.cjs');

test('THE SWEEP, real server: zero canary hits in every byte (whole, one byte at a time, console), over every route, identity and planting place', { timeout: 120000 }, async () => {
  const result = await runSweep({ start: startLocal });
  assert.deepEqual(result.hits, []);
  assert.deepEqual(result.streamHits, []);
  assert.deepEqual(result.consoleHits, []);
  assert.ok(result.requests >= 100 && result.size > 50000 && result.canaries === 34, `${result.requests} requests, ${result.size} bytes, ${result.canaries} canaries`);
  assert.ok(result.consoleLines >= 100, 'the console and log output was collected and scanned');
  assert.deepEqual([result.facts.created, result.facts.visitor, result.facts.checked, result.facts.failed, result.facts.failedCode], [200, 403, 200, 500, 'COMMAND_FAILED']);
  for (const kind of ['trace', 'runs', 'audit', 'logs']) assert.ok(result.facts[kind].total >= 1 && result.facts[kind].shown >= 1, kind);
  assert.ok(ROUTES.length >= 12 && METHODS.length === 6 && PLACES.length === 5);
});

test('the sweep is not vacuous: the same sweep over the naive stub of the RED finds canaries in raw, encoded and streamed form', { timeout: 150000 }, async () => {
  const some = Object.fromEntries(['raw', 'url', 'base64', 'hex', 'jsonUnicode', 'htmlDecimal', 'fullWidth'].map((name) => [name, ENCODERS[name]]));
  const result = await runSweep({ start: stub.startLocal, encoders: some, light: true });
  const ids = new Set(result.hits.map((hit) => hit.id));
  assert.ok(ids.size >= 15, `the naive stub leaks ${ids.size} of ${result.canaries} canaries`);
  assert.ok(result.streamHits.length > 0 && result.consoleHits.length > 0);
  assert.ok(result.hits.some((hit) => hit.id.startsWith('client-')), 'and client canaries it never held');
  assert.ok(new Set(result.hits.map((hit) => hit.form)).size >= 5, 'in several encodings');
});

test('place by place, encoding by encoding: every held canary planted in the raw store in ONE covered encoding never shows in a list or in the bundle', { timeout: 120000 }, () => {
  const config = seedConfig();
  const canaries = canaryList(config);
  for (const place of PLACES) {
    for (const [name, encode] of Object.entries(ENCODERS)) {
      const service = createService({ config });
      for (const canary of canaries) service.plant(place, `note ${encode(canary.value)} end`);
      const bytes = JSON.stringify(['trace', 'runs', 'audit', 'logs'].map((kind) => service.listBody(kind, 200))) + JSON.stringify(service.bundleBody());
      const hits = scan(bytes, canaries);
      assert.deepEqual(hits, [], `${place} / ${name}`);
      assert.ok(bytes.length > 2000, `${place} / ${name}: something was published`);
    }
  }
});
