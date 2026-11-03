"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
const evidence = path.join(root, "evidence");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "evidence.json"), "utf8"));
const record = (key) => JSON.parse(fs.readFileSync(path.join(root, manifest.records[key]), "utf8"));
function owned(relative) {
  const file = path.resolve(repo, relative);
  assert.ok(file.startsWith(`${root}${path.sep}`), `Unowned proof source: ${relative}`);
  return file;
}
function raw(value, kind) {
  const item = JSON.parse(fs.readFileSync(owned(value[kind]), "utf8"));
  const bytes = Buffer.from(item.data, "base64");
  assert.equal(bytes.length, item.bytes);
  assert.equal(sha256(bytes), item.sha256);
  assert.equal(bytes.toString("utf8"), item.utf8);
  return item.utf8;
}
function successful(key, count) {
  const value = record(key);
  assert.equal(value.exitCode, 0, key);
  assert.equal(value.signal, null);
  assert.equal(value.spawnError, null);
  assert.equal(value.runtime, "v22.23.4");
  const stdout = raw(value, "stdout");
  raw(value, "stderr");
  if (count !== undefined) {
    assert.match(stdout, new RegExp(`# tests ${count}\\r?\\n`));
    assert.match(stdout, new RegExp(`# pass ${count}\\r?\\n`));
    assert.match(stdout, /# fail 0\r?\n/);
  }
  for (const source of value.sources) {
    const bytes = fs.readFileSync(owned(source.path));
    assert.equal(bytes.length, source.bytes, source.path);
    assert.equal(sha256(bytes), source.sha256, source.path);
  }
  return { value, stdout };
}

test("surface: exact portable manifest, BDD and one unaccepted SC-S025 S unit", () => {
  assert.equal(fs.readFileSync(path.join(root, ".gitattributes"), "utf8").trim(),
    "* -text whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol");
  assert.equal(manifest.cardId, "A-S025");
  assert.equal(manifest.workerId, "worker-A-S025");
  assert.equal(manifest.sourceId, "S025");
  assert.deepEqual(manifest.parents, ["D-S025"]);
  assert.equal(manifest.kano, "S");
  assert.equal(manifest.kanoUnit, "A-S025");
  assert.equal(manifest.packet, "SC-S025");
  assert.equal(manifest.technicalEntryGate, "SOURCE");
  assert.equal(manifest.configuration.entryPoint, "learning\\S025\\index.html");
  assert.equal(manifest.review.doneCreditClaimed, false);
  assert.equal(manifest.nativeProof, false);
  assert.equal(manifest.productionNode24Validated, false);
  assert.equal(manifest.parentComplete, false);
  assert.equal(manifest.additionalKanoCredits, 0);
  const source = record("source");
  assert.equal(source.readBeforeBehaviorDesign, true);
  assert.match(source.exactRead.source, /Runtime and cache warm-up.*JVM\/JIT/);
  assert.match(source.exactRead.backlog, /D-S025.*JVM\/bean\/cache\/pool.*P007/);
  assert.deepEqual(source.exactRead.packetCards.map((card) => card.id), ["A-S025", "B-S025"]);
  const bdd = fs.readFileSync(path.join(root, manifest.records.bdd), "utf8");
  assert.match(bdd, /Initialization success is not acceptable client latency/);
  assert.match(bdd, /unsupported stream route/);
});

test("surface: strict local CSP, safe text rendering and unshadowed native reset", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(html.includes("Training rehearsal - synthetic data - not a live Azure result"));
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "base-uri 'none'", "form-action 'none'", "object-src 'none'",
    "frame-src 'none'", "worker-src 'none'"]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|(?:id|name)="reset"/i);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  for (const [, attributes, body] of scripts) {
    assert.equal(body, "");
    const src = attributes.match(/src="([^"]+)"/)?.[1];
    assert.ok(["warmup.js", "app.js"].includes(src));
    assert.ok(fs.existsSync(path.join(root, src)));
    assert.match(attributes, /\bdefer\b/);
  }
  for (const file of ["warmup.js", "app.js"]) {
    const code = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(code, /\b(fetch|XMLHttpRequest|WebSocket|EventSource|Worker|sendBeacon|localStorage|sessionStorage|eval)\b|https?:\/\//);
    assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  }
  assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "styles.css"), "utf8"), /@import|url\(/i);
});

test("surface: bounded pure model and explicit unmeasured user/route limits", () => {
  const model = require("..\\warmup.js");
  const state = model.initialState();
  assert.equal(state.current, null);
  assert.equal(state.history.length, 0);
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /Real user impact UNMEASURED/);
  assert.match(html, /No production route/);
  assert.match(html, /No run is evicted/);
  const browserTest = fs.readFileSync(path.join(__dirname, "browser.test.cjs"), "utf8");
  assert.match(browserTest, /openIsolatedLesson\("learning\\\\S025\\\\index.html"\)/);
  assert.match(browserTest, /finally[\s\S]*await session\.close\(\)/);
  assert.match(browserTest, /CAPTURE_BROWSER_EVIDENCE === "1"/);
  assert.doesNotMatch(browserTest, /--no-sandbox|ignoreHTTPSErrors|bypassCSP|connectOverCDP/);
});

test("proof: real assertion RED precedes IaC N/A and uses inert loadable snapshots", () => {
  const red = record("red");
  assert.equal(red.exitCode, 1);
  assert.equal(red.spawnError, null);
  const stdout = raw(red, "stdout");
  const stderr = raw(red, "stderr");
  assert.match(stdout, /# tests 24\r?\n/);
  assert.match(stdout, /# pass 1\r?\n/);
  assert.match(stdout, /# fail 23\r?\n/);
  const codes = [...stdout.matchAll(/code: '([^']+)'/g)].map((match) => match[1]);
  assert.equal(codes.length, 23);
  assert.ok(codes.every((code) => code === "ERR_ASSERTION"));
  assert.doesNotMatch(stdout + stderr, /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|ENOENT|command not found|TypeError:/i);
  assert.equal(red.snapshots.length, 3);
  for (const snapshot of red.snapshots) {
    assert.ok(snapshot.path.endsWith(".snapshot.txt"));
    assert.equal(sha256(fs.readFileSync(owned(snapshot.path))), snapshot.sha256);
    assert.equal(snapshot.sha256, red.sources.find((source) => source.path === snapshot.source).sha256);
  }
  const stub = red.snapshots.find((snapshot) => snapshot.source.endsWith("\\warmup.js"));
  const context = { module: { exports: {} } };
  new vm.Script(fs.readFileSync(owned(stub.path), "utf8")).runInNewContext(context);
  assert.equal(typeof context.module.exports.assess, "function");
  assert.equal(typeof context.module.exports.compare, "function");
  const iac = record("iac");
  assert.equal(iac.result, "N/A");
  assert.equal(iac.authorization, "local-synthetic-only");
  assert.match(iac.recordedAfter, /red-001/);
  assert.equal(iac.recordedBefore, "implementation");
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(iac.recordedAtUtc));
});

test("proof: focused GREEN, syntax and surface raw provenance match final source bytes", () => {
  const green = successful("green", 27).value;
  const syntax = successful("syntax", 1).value;
  const surface = successful("surface", 3).value;
  assert.ok(Date.parse(record("iac").recordedAtUtc) <= Date.parse(green.startedAtUtc));
  assert.ok(Date.parse(green.finishedAtUtc) <= Date.parse(syntax.startedAtUtc));
  assert.ok(Date.parse(syntax.finishedAtUtc) <= Date.parse(surface.startedAtUtc));
  const before = record("red").sources.find((source) => source.path.endsWith("\\warmup.js")).sha256;
  const after = green.sources.find((source) => source.path.endsWith("\\warmup.js")).sha256;
  assert.notEqual(before, after);
  const normalization = record("publicationNormalization");
  assert.equal(normalization.qualified, false);
  assert.equal(normalization.publication.commit, manifest.publication.earlierUnqualifiedCommit);
  assert.equal(normalization.mismatches.length, 17);
  assert.ok(normalization.mismatches.every((item) => item.workingSha256 !== item.publishedSha256));
  const whitespace = record("publicationWhitespace");
  assert.equal(whitespace.exitCode, 2);
  assert.equal(whitespace.behavioralRed, false);
  for (const kind of ["stdout", "stderr"]) {
    const bytes = Buffer.from(whitespace[kind].data, "base64");
    assert.equal(bytes.length, whitespace[kind].bytes);
    assert.equal(sha256(bytes), whitespace[kind].sha256);
    assert.equal(bytes.toString("utf8"), whitespace[kind].utf8);
  }
  const cached = record("publicationCachedIndex");
  assert.equal(cached.qualified, false);
  assert.equal(cached.publication.commit, manifest.publication.intermediateUnqualifiedCommit);
  assert.equal(cached.mismatches.length, 13);
  const repair = record("publicationIndexRepair");
  assert.equal(repair.trackedFilesChecked, 81);
  assert.equal(repair.stagedBytesMatch, true);
  assert.equal(repair.unownedPathsStaged, false);
  assert.deepEqual(repair.command, ["git", "add", "--renormalize", "--", "learning\\S025"]);
});

test("proof: exact offline signed tooling and actual 14-leaf browser evidence with finally cleanup", () => {
  const actual = JSON.parse(successful("tooling").stdout);
  assert.equal(actual.node, "v22.23.4");
  assert.equal(actual.playwright, "1.56.1");
  assert.match(actual.browser.version, /^156\./);
  assert.equal(actual.browser.signatureStatus, "Valid");
  assert.match(actual.browser.signerSubject, /Microsoft Corporation/);
  assert.equal(actual.helperPublishedCommit, "53c0c0d");
  assert.equal(actual.helperSha256, manifest.tooling.helperSha256);
  assert.equal(actual.noPackagesInstalled, true);
  assert.equal(actual.noBrowserDownloaded, true);
  assert.equal(sha256(fs.readFileSync(path.join(repo, manifest.tooling.helper))), actual.helperSha256);
  const browser = successful("browser", 15).value;
  assert.ok(Date.parse(record("surface").finishedAtUtc) <= Date.parse(browser.startedAtUtc));
  const observed = record("browserObservations");
  assert.equal(observed.observations.length, 14);
  assert.ok(observed.observations.every((entry) => entry.passed));
  assert.equal(observed.topLevelError, null);
  assert.equal(observed.awaitedFinallyCloseResolved, true);
  assert.deepEqual(observed.pageErrors, []);
  assert.deepEqual(observed.attemptedNetwork, []);
  assert.equal(observed.playwrightVersion, "1.56.1");
  assert.equal(observed.browserVersion, actual.browser.version);
  assert.equal(observed.helperSha256, actual.helperSha256);
  const csp = observed.observations.find((entry) => entry.name.startsWith("actual CSP")).actual;
  assert.equal(csp.requestsReachingRouteGuard, 0);
  assert.equal(csp.enforced.inline, false);
  assert.equal(csp.enforced.handler, false);
  assert.equal(csp.enforced.fetch, "TypeError");
});

test("proof: capture without deliberate opt-in is rejected without modifying proof", () => {
  const snapshot = () => fs.readdirSync(evidence).sort().map((name) =>
    [name, sha256(fs.readFileSync(path.join(evidence, name)))]);
  const before = snapshot();
  const env = { ...process.env };
  delete env.CAPTURE_BROWSER_EVIDENCE;
  const attempt = spawnSync(process.execPath, [path.join(__dirname, "capture.cjs"), "green",
    "--test", path.join(__dirname, "warmup.test.cjs")], { cwd: repo, env, encoding: "utf8", windowsHide: true });
  assert.equal(attempt.status, 1);
  assert.match(attempt.stderr, /Intentional capture only/);
  assert.deepEqual(snapshot(), before);
});
