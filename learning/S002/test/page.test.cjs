"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = ["lesson.js", "app.js"].map((name) => fs.readFileSync(path.join(root, name), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("page declares the exact rehearsal banner, stable IDs, SOURCE gate and native exclusions", () => {
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  for (const id of ["A-S002", "D-S002", "S002", "SC-S002"]) assert.ok(html.includes(id));
  assert.equal(manifest.kanoUnit, "A-S002");
  assert.equal(manifest.kano, "S");
  assert.equal(manifest.technicalEntryGate, "SOURCE");
  assert.equal(manifest.nativeEvidence, false);
  assert.equal(manifest.parentComplete, false);
  assert.equal(manifest.reliabilityCertified, false);
  assert.match(html, /C001 runtime\/auth\/hosting/);
  assert.match(html, /separate scaffold\/deploy approvals are absent/);
});

test("CSP denies default and connection access with only local scripts and styles", () => {
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(policy);
  for (const directive of [
    "default-src 'none'", "connect-src 'none'", "script-src 'self'",
    "style-src 'self'", "base-uri 'none'", "form-action 'none'", "object-src 'none'"
  ]) assert.ok(policy.includes(directive), directive);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https?:|data:/);
  const scriptNames = Array.from(html.matchAll(/<script src="([^"]+)" defer><\/script>/g), (match) => match[1]);
  assert.deepEqual(scriptNames, ["lesson.js", "app.js"]);
  assert.match(html, /<link rel="stylesheet" href="style.css">/);
  assert.doesNotMatch(html, /\son[a-z]+=["']|<script\s*>|<style\s*>|style=["']/i);
  assert.doesNotMatch(html, /<(?:iframe|img|object|embed)\b|rel="(?:preconnect|prefetch|dns-prefetch)"/i);
  for (const name of [...scriptNames, "style.css"]) assert.ok(fs.existsSync(path.join(root, name)));
});

test("lesson scripts contain no network, credentials, management or persistent-state mechanism", () => {
  for (const source of scripts) {
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|eval)\s*\(/);
    assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB|serviceWorker)\b/);
    assert.doesNotMatch(source, /management\.azure\.com|Authorization\s*:|Bearer\s+[A-Za-z0-9._-]+/i);
    assert.doesNotMatch(source, /\bset(?:Timeout|Interval)\s*\(/);
  }
});

test("every condition is labeled and user impact, verifier and cleanup are separate", () => {
  const selectIds = Array.from(html.matchAll(/<select id="([^"]+)"/g), (match) => match[1]);
  assert.deepEqual(selectIds, ["profile", "target", "configuration", "readiness", "statusPolicy", "formerWork"]);
  for (const id of selectIds) assert.ok(html.includes(`<label for="${id}">`), id);
  assert.match(html, /id="status" role="status" aria-live="polite" aria-atomic="true"/);
  for (const id of ["verify-heading", "impact-heading", "cleanup-heading", "limits-heading"]) {
    assert.ok(html.includes(`aria-labelledby="${id}"`), id);
  }
  assert.equal(Array.from(html.matchAll(/type="checkbox"/g)).length, 5);
  assert.match(html, /id="verify" disabled/);
  assert.match(html, /type="button" id="reset"/);
});

test("Microsoft disclaimer and official worker-recycling reference remain visible", () => {
  assert.match(html, /Microsoft Open Source Disclaimer/);
  assert.match(html, /\.\.\/\.\.\/README\.md#microsoft-open-source-disclaimer/);
  assert.match(html, /https:\/\/learn\.microsoft\.com\/azure\/app-service\/deploy-staging-slots#swap-operation-steps/);
  assert.match(html, /without warranties or guarantees/);
  assert.match(html, /do not imply endorsement/);
  assert.match(html, /No reference is fetched automatically/);
});

test("reset handler bypasses the named form control that shadows form.reset", () => {
  assert.match(scripts[1], /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(scripts[1], /\bform\.reset\s*\(/);
});
