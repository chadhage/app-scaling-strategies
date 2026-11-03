"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const read = name => readFileSync(join(__dirname, "..", name), "utf8");
const html = read("index.html");
const scripts = ["app.js", "cutover.js", "fixtures.js"].map(read);

test("the exact synthetic/not-live label is prominent and the source/parent identity is declared", () => {
  assert.match(html, /<p class="training">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  assert.match(html, /A-S041.*Source S041.*Parent D-S041.*Packet SC-S041/);
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.entryPoint, "learning/S041/index.html");
  assert.equal(manifest.executionMode, "synthetic");
  assert.equal(manifest.iac.status, "N/A");
  assert.equal(manifest.testRuntime.productionRuntimeApproval, false);
});

test("the portable page declares restrictive CSP and references only local script and style files", () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "img-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'"]) {
    assert.ok(csp.includes(directive), directive);
  }
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]),
    ["fixtures.js", "cutover.js", "app.js"]);
  assert.match(html, /href="styles.css"/);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
  assert.doesNotMatch(html, /https?:|<iframe|<form|type="module"/i);
});

test("Reset and all other action buttons cannot submit/reset or shadow a native form method", () => {
  const buttons = [...html.matchAll(/<button([^>]+)>/g)].map(match => match[1]);
  assert.equal(buttons.length, 4);
  assert.equal(buttons.every(button => /type="button"/.test(button)), true);
  assert.match(html, /id="s041-reset"[^>]+type="button"/);
  assert.doesNotMatch(html, /(?:id|name)="(?:reset|submit)"/);
  assert.doesNotMatch(scripts[0], /\.reset\s*\(|\.submit\s*\(/);
  assert.match(scripts[0], /byId\("reset"\)\.addEventListener\("click"/);
});

test("all input/select/textarea controls have associated labels and results have live status", () => {
  for (const match of html.matchAll(/<(?:input|select|textarea)\b[^>]*id="([^"]+)"/g)) {
    assert.ok(html.includes('for="' + match[1] + '"'), match[1]);
  }
  assert.match(html, /id="s041-summary"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(html, /id="s041-prediction-result" role="status"/);
  assert.match(read("styles.css"), /:focus-visible/);
});

test("model and UI have no network, storage or real-clock APIs and render untrusted text as text", () => {
  for (const script of scripts) {
    assert.doesNotMatch(script, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|setTimeout|setInterval)\b/);
    assert.doesNotMatch(script, /Date\.now|performance\.now|innerHTML|document\.write/);
  }
  assert.match(scripts[0], /element\.textContent = text/);
  assert.match(scripts[0], /JSON\.parse\(editor\.value\)/);
});
