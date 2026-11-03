'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const schema = require('../matrix.schema.json');
const contract = require('../matrix-contract.js');
const matrix = require('../matrix-data.js');
const root = path.join(__dirname, '..');

test('portable schema version, enums, keys, and permission constants match runtime contract', () => {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schemaVersion.const, contract.SCHEMA_VERSION);
  for (const [key, values] of [['status', contract.STATUSES], ['host', contract.HOSTS],
    ['format', contract.FORMATS], ['mechanism', contract.MECHANISMS]]) {
    assert.deepEqual(schema.$defs[key].enum, values);
  }
  assert.deepEqual(schema.required.slice().sort(), Object.keys(matrix).sort());
  assert.deepEqual(schema.$defs.row.required.slice().sort(), Object.keys(matrix.rows[0]).sort());
  for (const key of contract.FLAG_KEYS) assert.equal(schema.properties.permissions.properties[key].const, false);
  for (const key of contract.TARGET_KEYS) assert.equal(schema.properties.design.properties.target.properties[key].const, null);
  assert.equal(schema.$defs.row.properties.qualified.const, false);
  assert.equal(schema.$defs.row.properties.nativeEvidence.maxItems, 0);
  assert.equal(schema.$defs.row.properties.status.not.const, 'qualified');
  assert.equal(schema.properties.rows.maxContains, 1);
});

test('TypeScript declaration exposes all filter/status unions and literal denial boundaries', () => {
  const declaration = fs.readFileSync(path.join(root, 'matrix-contract.d.ts'), 'utf8');
  for (const value of contract.STATUSES.concat(contract.HOSTS, contract.FORMATS, contract.MECHANISMS)) {
    assert.ok(declaration.includes("'" + value + "'"), value);
  }
  assert.match(declaration, /readonly schemaVersion: '1\.0\.0'/);
  assert.match(declaration, /LocalCapabilityStatus = Exclude<CapabilityStatus, 'qualified'>/);
  assert.match(declaration, /readonly qualified: false/);
  assert.match(declaration, /readonly nativeEvidence: readonly never\[\]/);
  for (const key of contract.FLAG_KEYS) assert.ok(declaration.includes('readonly ' + key + ': false'));
});

test('local surface has a restrictive CSP, accessible controls, and no inline executable content', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'matrix-page.js'), 'utf8');
  for (const directive of ["default-src 'none'", "script-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'"]) {
    assert.ok(html.includes(directive));
  }
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|<script(?![^>]*\bsrc=)[^>]*>| on\w+=|<iframe|<form/i);
  assert.doesNotMatch(page, /innerHTML|outerHTML|eval\(|fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  for (const id of ['query', 'host', 'format', 'status', 'local-json']) {
    assert.ok(html.includes('for="' + id + '"'));
    assert.ok(html.includes('id="' + id + '"'));
  }
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(fs.readFileSync(path.join(root, 'matrix.css'), 'utf8').includes(':focus-visible'));
  assert.match(html, /Six or ten completed synthetic lessons do not qualify native Azure/);
  assert.match(page, /schema-consistent only, not authenticated documentation/);
});

test('all local HTML asset and repository-baseline links resolve without fetching anything', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const file = path.resolve(root, match[1]);
    assert.ok(fs.statSync(file).isFile(), match[1]);
  }
});
