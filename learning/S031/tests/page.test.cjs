"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("standalone page declares training scope and network-denying CSP", () => {
  const html = read("index.html");
  assert.ok(html.includes("Training rehearsal - synthetic data - not a live Azure result"));
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "form-action 'none'", "base-uri 'none'",
    "object-src 'none'", "frame-src 'none'"
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|https?:\/\/|<script(?![^>]*\bsrc=)/);
});

test("all local assets exist and no control shadows native form methods", () => {
  const html = read("index.html");
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    assert.ok(fs.existsSync(path.join(root, match[1])), match[1]);
  }
  const controls = html.match(/<(?:input|select|textarea|button)\b[^>]*>/g);
  for (const control of controls) {
    assert.doesNotMatch(control, /\b(?:id|name)=["'](?:reset|submit)["']/i);
  }
  assert.ok(html.includes('id="reset-exercise"'));
  assert.ok(html.includes('id="input-error" role="alert"'));
  assert.ok(html.includes('aria-live="polite"'));
});

test("renderer uses text nodes and no network, credentials or browser persistence APIs", () => {
  const app = read("app.js");
  const behavior = read("session.js");
  assert.doesNotMatch(app + behavior,
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|eval)\b|\.innerHTML\b|insertAdjacentHTML|document\.write/);
  assert.ok(app.includes("textContent"));
  assert.ok(app.includes("requestForm.reset()"));
});

test("supplied sample matching is not worded as store continuity", () => {
  const html = read("index.html");
  const app = read("app.js");
  assert.ok(html.includes('id="source-counts"'));
  assert.ok(html.includes("Matching supplied samples alone cannot prove even synthetic store continuity."));
  assert.ok(app.includes("summary.allPreserved && storedReads === 0"));
  assert.ok(app.includes("no stored-profile read was observed."));
});

test("behavior also loads as a browser script without a Node module loader", () => {
  const context = vm.createContext({});
  vm.runInContext(read("session.js"), context, { filename: "S031-session.js" });
  assert.equal(typeof context.S031Session.startRehearsal, "function");
  const state = context.S031Session.startRehearsal("shared").state;
  const result = context.S031Session.visit(state, {
    clientId: "client-amber", destination: "v2/green-a", replyKind: "stored"
  });
  assert.equal(result.report.outcome, "preserved");
  // This checks the script export only; it is not browser/DOM evidence.
});
