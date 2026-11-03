"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");

test("all owned executable JavaScript files parse without executing captures or snapshots", () => {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "evidence") continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(?:js|cjs)$/.test(entry.name)) files.push(file);
    }
  }
  visit(root);
  assert.ok(files.length >= 8);
  for (const file of files) {
    const child = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", timeout: 10000 });
    assert.equal(child.status, 0, `${file}\n${child.stderr}`);
  }
});

test("portable surface has local scripts/styles, strict CSP, accessible native controls and no reset shadowing", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const model = fs.readFileSync(path.join(root, "authorization.js"), "utf8");
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "img-src 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(csp.includes(directive), directive);
  }
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
  assert.doesNotMatch(html, /\s(?:on[a-z]+|style)\s*=/i);
  assert.doesNotMatch(html, /<(?:iframe|object|embed|style)\b/i);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  scripts.forEach((match) => {
    assert.match(match[1], /\bdefer\b/);
    assert.match(match[1], /src="(?:authorization|app)\.js"/);
    assert.equal(match[2], "");
  });
  assert.match(html, /role="alert" tabindex="-1" hidden/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /class="skip" href="#exercise"/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(`${app}${model}`, /fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|innerHTML|eval\(|setTimeout|Math\.random|Date\(/);
});
