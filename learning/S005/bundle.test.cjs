"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = file => fs.readFileSync(path.join(__dirname, file), "utf8");
const html = read("index.html");
const script = read("lesson.js");
const manifest = JSON.parse(read("manifest.json"));

test("A-S005 bundle declares the exact visible training disclaimer and source identity", () => {
  assert.match(html, /<p class="training-banner">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  assert.equal(manifest.cardId, "A-S005");
  assert.equal(manifest.kano, "S");
  assert.equal(manifest.parentId, "D-S005");
  assert.equal(manifest.sourceId, "S005");
  assert.equal(manifest.mode, "synthetic-training");
  assert.equal(manifest.iac.status, "not-applicable");
});

test("A-S005 CSP blocks connections, navigation, inline code, frames and active plugins", () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|\*/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script(?![^>]*\bsrc=)[^>]*>/i);
});

test("A-S005 all executable assets and links are local and browser-loadable", () => {
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert.ok(references.includes("migration.js"));
  assert.ok(references.includes("lesson.js"));
  assert.ok(references.includes("lesson.css"));
  for (const reference of references) {
    assert.doesNotMatch(reference, /^(?:[a-z]+:|\/\/)|\.\./i);
    assert.ok(fs.existsSync(path.join(__dirname, reference)), reference);
  }
});

test("A-S005 form has keyboard-native controls and no reset/submit method shadowing", () => {
  assert.match(html, /<label for="tenant-id">/);
  assert.match(html, /<select id="tenant-id" name="tenantId"/);
  assert.match(html, /<button type="reset" id="reset-rehearsal">/);
  assert.doesNotMatch(html, /\b(?:name|id)="(?:reset|submit)"/i);
  assert.match(script, /form\.addEventListener\("submit"/);
  assert.match(script, /event\.preventDefault\(\)/);
  assert.match(script, /form\.addEventListener\("reset"/);
  assert.match(script, /select\.value = model\.TENANT_IDS\[0\]/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(read("lesson.css"), /:focus-visible/);
});

test("A-S005 input and output avoid credential, storage and management interfaces", () => {
  for (const file of ["migration.js", "lesson.js"]) {
    assert.doesNotMatch(read(file), /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|eval)\b|\.innerHTML\b|document\.cookie|\bDate\b|Math\.random/);
  }
  assert.doesNotMatch(html, /type="password"|contenteditable|<iframe|<object|<embed/i);
  assert.match(script, /textContent/);
});

test("A-S005 manifest documents the fixture, assertions, limits and complete public controls", () => {
  assert.equal(manifest.syntheticInput.stepLimit, 80);
  assert.equal(manifest.syntheticInput.fixture, "S005-fixture-v1");
  assert.deepEqual(manifest.syntheticInput.tenants, ["cedar", "birch", "maple"]);
  assert.ok(manifest.preconditions.length >= 3);
  assert.ok(manifest.expectedAssertions.length >= 6);
  assert.ok(manifest.limits.some(limit => limit.includes("not permission")));
  for (const action of ["read", "sync", "migrate", "write", "job", "source-worker", "dual-ownership", "audit-unrelated"]) {
    assert.ok(html.includes(`name="operation" value="${action}"`), action);
  }
});

test("A-S005 source BDD covers all required negative paths and browser Reset", () => {
  const feature = read("migration.feature");
  for (const text of [
    "not-synchronized", "dual-ownership", "stale-fence", "unrelated-tenant-change",
    "unknown tenant", "unknown action", "Reset", "forceNew", "IaC"
  ]) assert.ok(feature.includes(text), text);
});

test("A-S005 bundle exposes distinct intention, configured routing, observation and effects", () => {
  for (const id of [
    "intended-destination", "configured-route", "action-observed", "last-observation",
    "effect-deltas", "source-effects", "target-effects", "isolation", "proposal-result", "ownership-invariant"
  ]) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(script, /No request sampled/);
  assert.match(html, /native\s+<strong>B-S005/);
});
