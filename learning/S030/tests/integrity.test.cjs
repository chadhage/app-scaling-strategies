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

test("exact S030, D-S030, A/B-S030 and atomic portable packet contracts are retained", () => {
  const source = json("evidence\\source-contract-001.json");
  assert.deepEqual(source.admittedCard.parents, ["D-S030"]);
  assert.equal(source.admittedCard.id, "A-S030");
  assert.equal(source.admittedCard.packet, "SC-S030");
  assert.equal(source.admittedCard.kano, "S");
  assert.equal(source.admittedCard.kanoUnit, "A-S030");
  assert.equal(source.admittedCard.owner, "worker-A-S030");
  assert.equal(source.admittedCard.authorization, "local-synthetic-only");
  assert.equal(source.admittedCard.technicalEntryGate, "SOURCE");
  assert.equal(source.sources.length, 4);
  for (const item of source.sources) {
    assert.ok(fs.readFileSync(path.join(repo, item.path), "utf8").split(/\r?\n/).includes(item.exactRow));
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
  }
  assert.match(source.sources[0].exactRow, /Limit initialization concurrency so candidate preparation does not overwhelm shared dependencies/);
  assert.match(source.sources[1].exactRow, /Dependency load, initialization duration, and journey outcomes/);
  assert.match(source.atomicAndPortableContractVerbatim, /standalone, browser-openable lesson bundle/);
  assert.ok(source.atomicAndPortableContractVerbatim.includes(banner));
});

test("owned HTML assets, strict CSP, accessible labels and safe reset naming", () => {
  const html = read("index.html");
  assert.ok(html.includes(banner));
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const policy of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "frame-src 'none'", "object-src 'none'", "worker-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(csp.includes(policy), policy);
  }
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script(?![^>]*\bsrc=)[^>]*>|style\s*=/i);
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(assets, ["styles.css", "warmup.js", "app.js", "#exercise", "README.md"]);
  for (const asset of assets.filter((value) => !value.startsWith("#"))) assert.ok(fs.existsSync(path.join(root, asset)));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["candidate-count", "bounded-limit", "db-capacity", "cache-capacity", "init-budget", "observations", "prediction"]) {
    assert.ok(html.includes(`<label for="${id}">`));
  }
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(html, /id="clear-history" type="button"/);
  assert.match(read("app.js"), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(read("app.js"), /byId\("candidate-count"\)\.focus\(\)/);
  assert.doesNotMatch(read("app.js"), /innerHTML|outerHTML|insertAdjacentHTML|eval\(|fetch\(|XMLHttpRequest|localStorage|setInterval/);
});

test("genuine behavioral RED is preserved, loadable and non-auto-discovered", () => {
  const red = json("evidence\\red-001.json");
  assert.equal(red.exitCode, 1);
  assert.equal(red.spawnError, null);
  const stdout = fs.readFileSync(path.join(repo, red.stdout.path), "utf8");
  assert.match(stdout, /# pass 2\n# fail 22/);
  assert.equal((stdout.match(/code: 'ERR_ASSERTION'/g) || []).length, 22);
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|SyntaxError/);
  assert.equal(red.snapshots.length, 3);
  for (const snapshot of red.snapshots) {
    assert.ok(snapshot.path.endsWith(".snapshot.txt"));
    assert.equal(digest(fs.readFileSync(path.join(repo, snapshot.path))), snapshot.sha256);
    if (!snapshot.source.endsWith("warmup.js")) assert.equal(digest(fs.readFileSync(path.join(repo, snapshot.source))), snapshot.sha256);
  }
  const stub = read("evidence\\red-001-warmup.js.snapshot.txt");
  assert.match(stub, /function analyze\(\)/);
  assert.notEqual(digest(stub), digest(read("warmup.js")));
  const iac = json("evidence\\iac-na.json");
  assert.equal(iac.decision, "N/A");
  assert.match(iac.sequence, /After red-001.*before behavior implementation/);
});

test("raw capture bytes and timestamps retain complete provenance", () => {
  const names = fs.readdirSync(path.join(root, "evidence"))
    .filter((name) => /^(?:source|red|green|browser|verification)-\d{3}\.json$/.test(name));
  assert.ok(names.length >= 4);
  for (const name of names) {
    const item = json(`evidence\\${name}`);
    assert.equal(item.cardId, "A-S030");
    assert.equal(item.packet, "SC-S030");
    assert.equal(item.captureBrowserEvidence, "1");
    assert.equal(item.spawnError, null);
    assert.ok(Date.parse(item.finishedAtUtc) >= Date.parse(item.startedAtUtc));
    assert.equal(item.runtime, "v22.23.4");
    assert.match(item.gitHeadBeforeRun, /^[a-f0-9]{40}$/);
    for (const stream of [item.stdout, item.stderr]) {
      const bytes = fs.readFileSync(path.join(repo, stream.path));
      assert.equal(bytes.length, stream.bytes);
      assert.equal(digest(bytes), stream.sha256);
    }
    for (const source of item.sources) {
      assert.ok(source.path.startsWith("learning\\S030\\"));
      assert.match(source.sha256, /^[a-f0-9]{64}$/);
    }
  }
  const green = json("evidence\\green-001.json");
  assert.equal(green.exitCode, 0);
  assert.match(fs.readFileSync(path.join(repo, green.stdout.path), "utf8"), /# pass 24\n# fail 0/);
  const red = json("evidence\\red-001.json");
  assert.ok(Date.parse(green.startedAtUtc) > Date.parse(red.finishedAtUtc));
  assert.match(read(".gitattributes"), /evidence\/\*\.stdout\.txt -text -diff/);
  assert.match(read(".gitattributes"), /cr-at-eol/);
});

test("only existing offline Playwright and signed Edge with the published helper are qualified", () => {
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
  assert.match(browser, /await openIsolatedLesson\("learning\\\\S030\\\\index\.html"\)/);
  assert.match(browser, /finally[\s\S]*await session\.close\(\)/);
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === "1"/);
  assert.doesNotMatch(browser, /--no-sandbox|ignoreHTTPSErrors|bypassCSP:\s*true|chromium\.launch/);
});

test("principal actual-browser observation has every leaf check and awaited finally cleanup", () => {
  const manifest = json("evidence.json");
  const observed = json(manifest.principalBrowserObservation);
  assert.equal(observed.observations.length, 14);
  assert.ok(observed.observations.every((item) => item.passed));
  assert.equal(observed.topLevelError, null);
  assert.equal(observed.cleanupError, null);
  assert.equal(observed.awaitedFinallyCloseResolved, true);
  assert.deepEqual(observed.pageErrors, []);
  assert.deepEqual(observed.attemptedNetwork, []);
  const csp = observed.observations.find((item) => item.name.startsWith("actual browser CSP")).actual;
  assert.equal(csp.routeGuardExternalRequests, 0);
  assert.equal(csp.inlineExecuted, false);
  assert.equal(csp.handlerExecuted, false);
  for (const source of observed.sources) assert.equal(digest(fs.readFileSync(path.join(repo, source.path))), source.sha256);
});

test("per-card manifest owns every current source hash and no inflated completion claim", () => {
  const manifest = json("evidence.json");
  assert.equal(manifest.cardId, "A-S030");
  assert.equal(manifest.parentId, "D-S030");
  assert.equal(manifest.packet, "SC-S030");
  assert.equal(manifest.kano, "S");
  assert.equal(manifest.kanoUnit, "A-S030");
  assert.equal(manifest.nativeQualified, false);
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.productionNode24Qualified, false);
  assert.equal(manifest.acceptance, "Parent-owned independent review pending; worker awards no Done credit.");
  assert.ok(manifest.sourceHashes.length >= 12);
  for (const source of manifest.sourceHashes) {
    assert.ok(source.path.startsWith("learning\\S030\\"));
    assert.equal(digest(fs.readFileSync(path.join(repo, source.path))), source.sha256, source.path);
  }
  for (const document of ["README.md", "warmup.feature", "index.html"]) assert.ok(read(document).includes(banner));
});
