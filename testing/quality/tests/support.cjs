'use strict';
// Shared test support: loads the accepted fixture, re-seals mutated copies and registers one negative test per rule code.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const test = require('node:test');
const { validatePacket } = require('../packet-validator.cjs');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'packet-accepted.json');
const NOW = '2026-11-07T12:00:00Z';

const load = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

function reseal(p) {
  const { integrity, validation, ...body } = p;
  p.integrity = { ...(integrity || {}), packetSha256: crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex') };
  return p;
}

const run = (p, extra = {}) => validatePacket(p, { nowUtc: NOW, ...extra });
const line = (p, key, region) => p.pricing.lines.find((l) => l.key === key && l.region === region);
const { faithfulMarkdown } = require('./md.cjs');
const goodMarkdown = (p) => faithfulMarkdown(p);

// One negative test: mutate a copy of the fixture, re-seal it (unless the test is about the seal), and expect the code.
function negative(code, name, mutation, { markdown, nowUtc, seal = true } = {}) {
  test(`${code}: ${name}`, () => {
    const p = load();
    mutation(p);
    if (seal) reseal(p);
    const result = run(p, { markdown: typeof markdown === 'function' ? markdown(p) : markdown, nowUtc: nowUtc || NOW });
    assert.equal(result.ok, false, `the mutated packet must be rejected (${code})`);
    assert.ok(result.findings.some((f) => f.code === code), `expected ${code}, got ${result.findings.map((f) => f.code).join(', ') || 'no findings'}`);
    for (const f of result.findings) {
      assert.equal(typeof f.path, 'string');
      assert.equal(typeof f.message, 'string');
      assert.ok(f.message.length > 5, 'a finding needs a readable message');
    }
  });
}

module.exports = { FIXTURE, NOW, load, reseal, run, line, goodMarkdown, negative, assert, test };
