'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const contract = require('../run-envelope-contract.js');
const fixture = require('../synthetic-fixture.js');
const source = (name) => readFileSync(join(__dirname, '..', name), 'utf8');

test('the published executable JSON Schema is closed and required at every level', () => {
  assert.equal(contract.schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  function visit(schema) {
    assert.ok(Object.isFrozen(schema));
    if (schema.type === 'object') {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(schema.required, Object.keys(schema.properties));
      for (const property of Object.values(schema.properties)) visit(property);
    } else {
      assert.ok(['integer', 'string'].includes(schema.type));
      if (schema.type === 'integer') {
        assert.ok(Number.isSafeInteger(schema.minimum));
        assert.ok(Number.isSafeInteger(schema.maximum));
      }
    }
  }
  visit(contract.schema);
  assert.equal(contract.metrics.length, 5);
  for (const path of contract.metrics) {
    const metric = path.split('.').reduce((value, key) => value.properties[key], contract.schema.properties.envelope);
    const bound = path.split('.').reduce((value, key) => value.properties[key], contract.schema.properties.limits);
    assert.equal(metric.type, 'integer');
    assert.deepEqual(bound.required, ['min', 'max']);
  }
  assert.ok(Object.isFrozen(fixture.limits.load.requestsPerSecond));
  assert.ok(fixture.limits.label.includes('not Azure authorization'));
});

test('missing schema or C001 guard denies in the validator factory (unit, not browser proof)', async () => {
  for (const dependencies of [{}, { C002RunEnvelopeContract: contract }]) {
    const context = { ...dependencies };
    runInNewContext(source('validator.js'), context);
    const result = await context.C002Validator.validateRunEnvelope(fixture, undefined);
    assert.equal(result.valid, false);
    assert.equal(result.executed, false);
    assert.ok(result.errors.some((error) => error.code === 'AUTHORITY_UNAVAILABLE'));
    if (!dependencies.C002RunEnvelopeContract) {
      assert.ok(result.errors.some((error) => error.code === 'SCHEMA_UNAVAILABLE'));
    }
  }
});

test('surface source keeps C001 authority separate and uses an offline restrictive CSP', () => {
  const html = source('index.html');
  assert.match(html, /src="\.\.\/C001\/approved-contract\.js"/);
  assert.match(html, /src="\.\.\/C001\/contract-guard\.js"/);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "frame-src 'none'",
    "worker-src 'none'", "base-uri 'none'", "form-action 'none'"
  ]) assert.ok(html.includes(directive));
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|https?:\/\/|<script(?![^>]*\bsrc=)/);
  assert.match(html, /id="schema-json"/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /for="envelope-input"/);
  assert.match(html, /for="limits-input"/);
  assert.match(html, /id="validate"[^>]*disabled/);
  assert.match(html, /id="load-fixture"[^>]*disabled/);
  assert.match(html, /Node\.js 24 LTS \/ Express production design is not runtime qualification/);
  for (const script of ['validator.js', 'json-input.js', 'run-envelope-page.js', 'run-envelope-contract.js', 'synthetic-fixture.js']) {
    assert.doesNotMatch(source(script), /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|\.innerHTML\s*=|eval\s*\(/);
  }
  assert.match(source('run-envelope-page.js'), /event\.preventDefault\(\)/);
  assert.match(source('run-envelope-page.js'), /version !== generation/);
  assert.match(source('run-envelope-page.js'), /clearResult\('RESET/);
});
