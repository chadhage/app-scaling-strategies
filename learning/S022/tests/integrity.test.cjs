"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
const evidence = path.join(root, "evidence");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const load = (name) => JSON.parse(fs.readFileSync(path.join(evidence, name), "utf8"));
const ownedFile = (relative) => {
  const file = path.resolve(repo, relative);
  assert.ok(file.startsWith(`${root}${path.sep}`), `Unowned proof source: ${relative}`);
  return file;
};

function raw(record, kind) {
  const value = JSON.parse(fs.readFileSync(ownedFile(record[kind]), "utf8"));
  const bytes = Buffer.from(value.data, "base64");
  assert.equal(bytes.length, value.bytes);
  assert.equal(sha256(bytes), value.sha256);
  assert.equal(bytes.toString("utf8"), value.utf8);
  return value.utf8;
}

function successful(name, testCount) {
  const record = load(name);
  assert.equal(record.exitCode, 0);
  assert.equal(record.signal, null);
  assert.equal(record.spawnError, null);
  assert.equal(record.runtime, "v22.23.4");
  const stdout = raw(record, "stdout");
  assert.match(stdout, new RegExp(`# tests ${testCount}\\r?\\n`));
  assert.match(stdout, new RegExp(`# pass ${testCount}\\r?\\n`));
  assert.match(stdout, /# fail 0\r?\n/);
  raw(record, "stderr");
  for (const source of record.sources) {
    const bytes = fs.readFileSync(ownedFile(source.path));
    assert.equal(bytes.length, source.bytes, source.path);
    assert.equal(sha256(bytes), source.sha256, source.path);
  }
  return record;
}

test("portable manifest preserves the exact card, packet, scope and unaccepted Kano unit", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "evidence.json"), "utf8"));
  assert.equal(manifest.cardId, "A-S022");
  assert.equal(manifest.workerId, "worker-A-S022");
  assert.equal(manifest.sourceId, "S022");
  assert.deepEqual(manifest.parents, ["D-S022"]);
  assert.equal(manifest.kano, "S");
  assert.equal(manifest.kanoUnit, "A-S022");
  assert.equal(manifest.packet, "SC-S022");
  assert.equal(manifest.technicalEntryGate, "SOURCE");
  assert.equal(manifest.configuration.entryPoint, "learning\\S022\\index.html");
  assert.equal(manifest.review.doneCreditClaimed, false);
  assert.equal(manifest.nativeProof, false);
  assert.equal(manifest.productionNode24Validated, false);
  assert.equal(manifest.parentComplete, false);
  assert.equal(manifest.additionalKanoCredits, 0);
});

test("HTML and runtime assets have a strict CSP, no remote APIs and no reset shadowing", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(html.includes("Training rehearsal - synthetic data - not a live Azure result"));
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "base-uri 'none'", "form-action 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'"
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|(?:id|name)="reset"/i);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  for (const [, attributes, body] of scripts) {
    assert.equal(body, "");
    const src = attributes.match(/src="([^"]+)"/)?.[1];
    assert.ok(["readiness.js", "app.js"].includes(src));
    assert.ok(fs.existsSync(path.join(root, src)));
    assert.match(attributes, /\bdefer\b/);
  }
  for (const local of ["readiness.js", "app.js"]) {
    const source = fs.readFileSync(path.join(root, local), "utf8");
    assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|EventSource|Worker|sendBeacon|localStorage|sessionStorage|eval)\b|https?:\/\//);
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  }
  assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "styles.css"), "utf8"), /@import|url\(/i);
});

test("RED is a real 27-assertion behavioral failure with lossless raw bytes and non-discovered snapshots", () => {
  const record = load("red-001.json");
  assert.equal(record.exitCode, 1);
  assert.equal(record.spawnError, null);
  const stdout = raw(record, "stdout");
  const stderr = raw(record, "stderr");
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /# tests 27\r?\n/);
  assert.match(stdout, /# pass 0\r?\n/);
  assert.match(stdout, /# fail 27\r?\n/);
  assert.doesNotMatch(stdout + stderr, /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|ENOENT|command not found/i);
  assert.equal(record.snapshots.length, 3);
  for (const snapshot of record.snapshots) {
    assert.ok(snapshot.path.endsWith(".snapshot.txt"));
    assert.equal(sha256(fs.readFileSync(ownedFile(snapshot.path))), snapshot.sha256);
    assert.equal(snapshot.sha256, record.sources.find((source) => source.path === snapshot.source).sha256);
  }
  const iac = load("iac-na.json");
  assert.equal(iac.result, "N/A");
  assert.equal(iac.authorization, "local-synthetic-only");
  assert.match(iac.recordedAfter, /red-001/);
  assert.match(iac.recordedBefore, /implementation/);
});

test("focused GREEN and syntax provenance match every final source byte", () => {
  const green = successful("green-002.json", 42);
  const syntax = successful("syntax-002.json", 1);
  const surface = successful("integrity-002.json", 3);
  const red = load("red-001.json");
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(green.startedAtUtc));
  assert.ok(Date.parse(green.finishedAtUtc) <= Date.parse(syntax.startedAtUtc));
  assert.ok(Date.parse(syntax.finishedAtUtc) <= Date.parse(surface.startedAtUtc));
  assert.notEqual(red.sources.find((source) => source.path.endsWith("\\readiness.js")).sha256,
    green.sources.find((source) => source.path.endsWith("\\readiness.js")).sha256);
});

test("qualified offline tooling has exact versions, helper hash and valid Microsoft signature", () => {
  const failedAttempt = load("tooling-001.json");
  assert.equal(failedAttempt.exitCode, 1);
  assert.match(raw(failedAttempt, "stderr"), /Microsoft\.PowerShell\.Security.*could not be loaded/s);
  raw(failedAttempt, "stdout");
  const record = load("tooling-002.json");
  assert.equal(record.exitCode, 0);
  const actual = JSON.parse(raw(record, "stdout"));
  raw(record, "stderr");
  assert.equal(actual.node, "v22.23.4");
  assert.equal(actual.playwright, "1.56.1");
  assert.equal(actual.browserVersion, "156.0.4314.50");
  assert.equal(actual.signatureStatus, "Valid");
  assert.match(actual.signerSubject, /Microsoft Corporation/);
  assert.equal(actual.helperSha256, "86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055");
  assert.equal(actual.helperPublishedCommit, "53c0c0d");
  assert.equal(actual.noPackagesInstalled, true);
  assert.equal(actual.noBrowserDownloaded, true);
  assert.equal(sha256(fs.readFileSync(path.join(repo, "testing", "browser", "isolated.cjs"))), actual.helperSha256);
});

test("actual DOM/CSP capture passed 15 leaf checks plus one parent and awaited finally cleanup", () => {
  const browser = successful("browser-001.json", 16);
  assert.ok(Date.parse(load("integrity-002.json").finishedAtUtc) <= Date.parse(browser.startedAtUtc));
  const record = load("browser-observations-001.json");
  assert.equal(record.observations.length, 15);
  assert.ok(record.observations.every((entry) => entry.passed));
  assert.equal(record.awaitedFinallyCloseResolved, true);
  assert.equal(record.topLevelError, null);
  assert.deepEqual(record.pageErrors, []);
  assert.deepEqual(record.attemptedNetwork, []);
  assert.equal(record.playwrightVersion, "1.56.1");
  assert.equal(record.browserVersion, "156.0.4314.50");
  const csp = record.observations.find((entry) => entry.name.startsWith("real CSP")).actual;
  assert.equal(csp.enforced.inline, false);
  assert.equal(csp.enforced.handler, false);
  assert.equal(csp.enforced.fetch, "TypeError");
  assert.equal(csp.routedExternalRequests, 0);
});
