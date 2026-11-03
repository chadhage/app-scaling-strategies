"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
const read = (local) => fs.readFileSync(path.join(root, local), "utf8");
const json = (local) => JSON.parse(read(local));
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const banner = "Training rehearsal - synthetic data - not a live Azure result";
const helperSha256 = "86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055";

test("exact S029, D-S029 and portable A/card packet are retained", () => {
  const source = json("evidence\\source-contract-001.json");
  assert.equal(source.admittedCard.id, "A-S029");
  assert.equal(source.admittedCard.packet, "SC-S029");
  assert.equal(source.admittedCard.kano, "S");
  assert.equal(source.admittedCard.kanoUnit, "A-S029");
  assert.equal(source.admittedCard.authorization, "local-synthetic-only");
  for (const record of source.sources) {
    const text = fs.readFileSync(path.join(repo, record.path), "utf8");
    assert.ok(text.split(/\r?\n/).includes(record.exactRow), record.path);
    assert.match(record.sha256, /^[a-f0-9]{64}$/);
  }
  assert.match(source.sources[0].exactRow, /suitable stable readiness window/);
  assert.match(source.sources[1].exactRow, /Fresh consecutive evidence gates promotion/);
  assert.match(source.atomicAndPortableContractVerbatim, /standalone, browser-openable lesson bundle/);
  assert.ok(source.atomicAndPortableContractVerbatim.includes(banner));
});

test("owned HTML assets, CSP, labels and reset control meet the portable contract", () => {
  const html = read("index.html");
  assert.ok(html.includes(banner));
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const rule of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "frame-src 'none'", "object-src 'none'", "worker-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(policy.includes(rule), rule);
  }
  assert.doesNotMatch(policy, /unsafe-|https?:|data:/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script(?![^>]*\bsrc=)[^>]*>|style\s*=/i);
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(assets, ["styles.css", "readiness.js", "app.js", "#exercise", "README.md"]);
  for (const asset of assets.filter((value) => !value.startsWith("#"))) assert.ok(fs.existsSync(path.join(root, asset)));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["fixture", "window-size", "freshness", "observe-tick", "prediction"]) {
    assert.ok(html.includes(`<label for="${id}">`));
  }
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(html, /id="restart-lesson" type="button"/);
  const app = read("app.js");
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(app, /Number\(value\)/);
  assert.match(app, /model\.recordRun\(state, configuration\(\)\)/);
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|fetch\(|XMLHttpRequest|localStorage|setInterval/);
  assert.match(app, /textContent/);
  assert.match(app, /byId\("fixture"\)\.focus\(\)/);
});

test("behavioral RED is genuine and original BDD/tests remain unchanged and undiscovered", () => {
  const red = json("evidence\\red-001.json");
  assert.equal(red.exitCode, 1);
  assert.equal(red.spawnError, null);
  const output = fs.readFileSync(path.join(repo, red.stdout.path), "utf8");
  assert.match(output, /# pass 2\n# fail 18/);
  assert.equal((output.match(/code: 'ERR_ASSERTION'/g) || []).length, 18);
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|SyntaxError/);
  for (const snapshot of red.snapshots) {
    assert.ok(snapshot.path.endsWith(".snapshot.txt"));
    assert.equal(digest(fs.readFileSync(path.join(repo, snapshot.path))), snapshot.sha256);
    if (!snapshot.source.endsWith("readiness.js")) {
      assert.equal(digest(fs.readFileSync(path.join(repo, snapshot.source))), snapshot.sha256);
    }
  }
  assert.notEqual(digest(read("evidence\\red-001-readiness.js.snapshot.txt")), digest(read("readiness.js")));
  assert.ok(read("readiness.feature").includes(banner));
});

test("raw capture bytes, source hashes and BDD-RED-IaC-green order remain intact", () => {
  const names = fs.readdirSync(path.join(root, "evidence"))
    .filter((name) => /^(?:red|green|browser|tooling)-\d{3}\.json$/.test(name));
  assert.ok(names.length >= 4);
  for (const name of names) {
    const record = json(`evidence\\${name}`);
    assert.equal(record.cardId, "A-S029");
    assert.equal(record.packet, "SC-S029");
    assert.equal(record.captureBrowserEvidence, "1");
    assert.equal(record.spawnError, null);
    assert.ok(Number.isInteger(record.exitCode));
    for (const stream of [record.stdout, record.stderr]) {
      const bytes = fs.readFileSync(path.join(repo, stream.path));
      assert.equal(bytes.length, stream.bytes);
      assert.equal(digest(bytes), stream.sha256);
    }
    for (const source of record.sources) {
      assert.ok(source.path.startsWith("learning\\S029\\"));
      assert.match(source.sha256, /^[a-f0-9]{64}$/);
    }
  }
  const red = json("evidence\\red-001.json");
  const iac = json("evidence\\iac-n-a.json");
  const green = json("evidence\\green-001.json");
  assert.equal(iac.iac, "N/A");
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(iac.decidedAtUtc));
  assert.ok(Date.parse(iac.decidedAtUtc) <= Date.parse(green.startedAtUtc));
  assert.equal(green.exitCode, 0);
  assert.match(read(".gitattributes"), /evidence\/\*\.stdout\.txt -diff/);
  assert.match(read(".gitattributes"), /\* -text whitespace=.*cr-at-eol/);
});

test("only the published helper and existing signed offline tooling are qualified", () => {
  const source = json("evidence\\source-contract-001.json");
  assert.equal(source.runtime, "v22.23.4");
  assert.equal(source.playwrightVersion, "1.56.1");
  assert.equal(source.edge.version, "156.0.4314.50");
  assert.equal(source.edge.status, "Valid");
  assert.match(source.edge.signer, /Microsoft Corporation/);
  assert.equal(source.helperSha256, helperSha256);
  assert.equal(source.helperPublishedCommit, "53c0c0d");
  assert.equal(digest(fs.readFileSync(path.join(repo, "testing", "browser", "isolated.cjs"))), helperSha256);
  const browser = read("tests\\browser.test.cjs");
  assert.match(browser, /await openIsolatedLesson\("learning\\\\S029\\\\index\.html"\)/);
  assert.match(browser, /finally[\s\S]*await session\.close\(\)/);
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === "1"/);
  assert.doesNotMatch(browser, /--no-sandbox|ignoreHTTPSErrors|bypassCSP:\s*true|chromium\.launch/);
});

test("principal actual browser observations include all guards, CSP denials and awaited cleanup", () => {
  const manifest = json("evidence.json");
  const observed = json(manifest.proof.browserObservations);
  assert.equal(json(manifest.proof.browser).exitCode, 0);
  assert.equal(observed.observations.length, 13);
  assert.ok(observed.observations.every((item) => item.passed));
  assert.equal(observed.topLevelError, null);
  assert.equal(observed.cleanupError, null);
  assert.equal(observed.awaitedFinallyCloseResolved, true);
  assert.deepEqual(observed.pageErrors, []);
  assert.deepEqual(observed.attemptedNetwork, []);
  const csp = observed.observations.find((item) => item.name.startsWith("real CSP")).actual;
  assert.equal(csp.routedExternalRequests, 0);
  assert.equal(csp.enforced.inline, false);
  assert.equal(csp.enforced.handler, false);
  assert.equal(csp.enforced.fetch, "TypeError");
  assert.equal(csp.enforced.baseUnchanged, true);
  const denied = csp.enforced.violations.map((item) => item.directive);
  for (const rule of ["script-src-elem", "script-src-attr", "connect-src", "frame-src",
    "object-src", "worker-src", "form-action", "base-uri"]) assert.ok(denied.includes(rule), rule);
});

test("manifest preserves one frozen satisfier, measurable outcomes and genuine native remainder", () => {
  const manifest = json("evidence.json");
  assert.equal(manifest.cardId, "A-S029");
  assert.equal(manifest.parentId, "D-S029");
  assert.equal(manifest.packet, "SC-S029");
  assert.equal(manifest.kano, "S");
  assert.equal(manifest.kanoUnit, "A-S029");
  assert.equal(manifest.mode, "synthetic-only");
  assert.equal(manifest.entry, "index.html");
  assert.equal(manifest.verifier.finiteConfigurationsChecked, 648);
  assert.equal(manifest.nativeRemainder.cardId, "B-S029");
  assert.equal(manifest.nativeRemainder.readiness, false);
  assert.match(manifest.nativeRemainder.blocker, /CORE, DATA and HOST/);
  assert.deepEqual(manifest.remainingLocalToDo, []);
  assert.equal(manifest.reviewer, null);
  assert.equal(manifest.acceptedAtUtc, null);
  assert.match(manifest.userImpact, /UNMEASURED.*not migration success/);
});
