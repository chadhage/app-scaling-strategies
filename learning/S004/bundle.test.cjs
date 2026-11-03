"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");
const html = read("index.html");
const css = read("lesson.css");
const scripts = read("experiment.js") + read("lesson.js");
const manifest = JSON.parse(read("manifest.json"));

test("A-S004 portable manifest preserves one Kano unit and its SOURCE identity", () => {
  assert.equal(manifest.cardId, "A-S004");
  assert.equal(manifest.workerId, "worker-A-S004");
  assert.equal(manifest.kano, "S");
  assert.equal(manifest.kanoUnit, "A-S004");
  assert.equal(manifest.parentId, "D-S004");
  assert.equal(manifest.sourceId, "S004");
  assert.equal(manifest.packet, "SC-S004");
  assert.equal(manifest.technicalEntryGate, "SOURCE");
  assert.equal(manifest.mode, "synthetic");
  assert.ok(fs.existsSync(path.join(__dirname, manifest.entry)));
});

test("manifest supplies objective, preconditions, actions, fixture and explicit assertions", () => {
  assert.match(manifest.objective, /50\/50/);
  assert.ok(manifest.preconditions.length >= 3);
  assert.ok(manifest.actions.length >= 5);
  assert.equal(manifest.syntheticInput.users, 20);
  assert.equal(manifest.syntheticInput.maximumRoundsPerRehearsal, 100);
  assert.ok(manifest.expectedAssertions.length >= 8);
});

test("IaC is N/A and C001 design approval is not cloud or framework adoption", () => {
  assert.equal(manifest.iac.status, "N/A");
  assert.deepEqual(manifest.iac.resourcesCreated, []);
  assert.equal(manifest.iac.cloudIacIdentityRegistrationOrSpendAuthorized, false);
  assert.equal(manifest.scope.framework, "none");
  assert.equal(manifest.scope.expressRequired, false);
  assert.equal(manifest.scope.nativeBS004Proof, false);
  assert.equal(manifest.scope.parentDS004Complete, false);
  assert.match(manifest.scope.testRuntime, /test tooling/);
});

test("the exact synthetic label is prominent and the limits deny native results", () => {
  assert.match(html, /class="banner">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  assert.match(html, /no B-S004 native behavior, full D-S004 acceptance/);
  assert.match(html, /Node 22 is test tooling only/);
  assert.match(html, /configured 50\/50 weights do not guarantee an exactly/);
  assert.match(html, /A passing negative guard check is not a passing user outcome/);
});

test("restrictive CSP permits only local scripts/styles and blocks connections/forms", () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https:|data:/);
});

test("all executable assets are local, dependency-free and do not make network/storage calls", () => {
  assert.deepEqual([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((match) => match[1]),
    ["experiment.js", "lesson.js"]);
  assert.equal([...html.matchAll(/<script\b/g)].length, 2);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(!/^(?:https?:|\/\/|data:)/.test(match[1]), match[1]);
  }
  assert.doesNotMatch(scripts, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage)\b/);
  assert.doesNotMatch(css, /@import|url\(/i);
  assert.doesNotMatch(html, /\s(?:style|on\w+)\s*=/i);
});

test("controls have labels, safe form names, explicit button types and announced results", () => {
  for (const id of ["hold-rounds", "condition"]) {
    assert.match(html, new RegExp(`<label for="${id}">`));
  }
  assert.doesNotMatch(html, /\b(?:id|name)=["'](?:reset|submit)["']/i);
  assert.equal([...html.matchAll(/<button\b/g)].length, 4);
  assert.equal([...html.matchAll(/<button[^>]*type="(?:button|submit)"/g)].length, 4);
  assert.match(html, /id="input-error" role="alert"/);
  assert.match(html, /id="live-result" role="status" aria-live="polite"/);
  assert.match(css, /:focus-visible/);
  assert.match(html, /class="skip-link" href="#exercise"/);
});

test("cohort inspection and adverse history remain separate accessible surfaces", () => {
  for (const id of [
    "observed-counts", "observation-age", "verifier-result", "impact-result",
    "migration-result", "cohort-rows", "round-history", "action-trace"
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<caption>Latest observed round only/);
  assert.match(html, /role="region" aria-label="Synthetic cohort observations, horizontally scrollable"/);
  assert.match(html, /Counts below are <strong>user observations<\/strong>, not distinct migrated people/);
});
