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

test("exact S026 source, D-S026, A-S026 and portable packet are retained", () => {
  const source = json("evidence\\source-contract-001.json");
  assert.equal(source.admittedCard.id, "A-S026");
  assert.equal(source.admittedCard.packet, "SC-S026");
  assert.equal(source.admittedCard.kano, "S");
  assert.equal(source.admittedCard.kanoUnit, "A-S026");
  assert.equal(source.admittedCard.authorization, "local-synthetic-only");
  for (const record of source.sources) {
    const text = fs.readFileSync(path.join(repo, record.path), "utf8");
    assert.ok(text.split(/\r?\n/).includes(record.exactRow), record.path);
    assert.match(record.sha256, /^[a-f0-9]{64}$/);
  }
  assert.match(source.sources[0].exactRow, /Keep production serving while the candidate downloads its image and initializes/);
  assert.match(source.sources[1].exactRow, /readiness does not precede successful initialization/);
  assert.match(source.atomicAndPortableContractVerbatim, /standalone, browser-openable lesson bundle/);
  assert.ok(source.atomicAndPortableContractVerbatim.includes(banner));
});

test("HTML has only owned assets, strict CSP, labelled controls and no reset shadowing", () => {
  const html = read("index.html");
  assert.ok(html.includes(banner));
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const policy of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "frame-src 'none'", "object-src 'none'", "worker-src 'none'",
    "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(policy), policy);
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script(?![^>]*\bsrc=)[^>]*>|style\s*=/i);
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(assets, ["styles.css", "startup.js", "app.js", "#exercise", "README.md"]);
  for (const asset of assets.filter((value) => !value.startsWith("#"))) assert.ok(fs.existsSync(path.join(root, asset)));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["pull-ticks", "startup-ticks", "fault", "observe-tick", "prediction"]) {
    assert.ok(html.includes(`<label for="${id}">`));
  }
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(html, /id="restart-lesson" type="button"/);
});

test("UI uses strict numeric parsing, safe DOM output and explicit native reset", () => {
  const app = read("app.js");
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(app, /Number\(value\)/);
  assert.match(app, /state = model\.recordRun\(state, configuration\(\)\)/);
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|fetch\(|XMLHttpRequest|localStorage|setInterval/);
  assert.match(app, /textContent/);
  assert.match(app, /byId\("pull-ticks"\)\.focus\(\)/);
});

test("genuine RED snapshots remain non-auto-discovered and original assertions remain unchanged", () => {
  const red = json("evidence\\red-001.json");
  assert.equal(red.exitCode, 1);
  assert.equal(red.spawnError, null);
  const output = fs.readFileSync(path.join(repo, red.stdout.path), "utf8");
  assert.match(output, /# pass 2\n# fail 20/);
  assert.equal((output.match(/code: 'ERR_ASSERTION'/g) || []).length, 20);
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|SyntaxError/);
  for (const snapshot of red.snapshots) {
    assert.ok(snapshot.path.endsWith(".snapshot.txt"));
    const bytes = fs.readFileSync(path.join(repo, snapshot.path));
    assert.equal(digest(bytes), snapshot.sha256);
    if (!snapshot.source.endsWith("startup.js")) {
      assert.equal(digest(fs.readFileSync(path.join(repo, snapshot.source))), snapshot.sha256);
    }
  }
  const stub = read("evidence\\red-001-startup.js.snapshot.txt");
  assert.match(stub, /function evaluate\(configuration\)/);
  assert.notEqual(digest(stub), digest(read("startup.js")));
  assert.ok(read("image-startup.feature").includes(banner));
});

test("all historical capture streams and snapshots preserve their exact raw byte hashes", () => {
  const captures = fs.readdirSync(path.join(root, "evidence"))
    .filter((name) => /^(?:red|green|syntax|integrity|browser|tooling)-\d{3}\.json$/.test(name));
  assert.ok(captures.length >= 4);
  for (const name of captures) {
    const record = json(`evidence\\${name}`);
    assert.equal(record.cardId, "A-S026");
    assert.equal(record.packet, "SC-S026");
    assert.equal(record.captureBrowserEvidence, "1");
    assert.equal(record.spawnError, null);
    assert.equal(record.exitCode, record.stage === "red" ? 1 : 0);
    for (const stream of [record.stdout, record.stderr]) {
      const bytes = fs.readFileSync(path.join(repo, stream.path));
      assert.equal(bytes.length, stream.bytes, stream.path);
      assert.equal(digest(bytes), stream.sha256, stream.path);
    }
    for (const source of record.sources) {
      assert.ok(source.path.startsWith("learning\\S026\\"));
      assert.match(source.sha256, /^[a-f0-9]{64}$/);
    }
  }
  assert.match(read(".gitattributes"), /evidence\/\*\.stdout\.txt -text/);
  assert.match(read(".gitattributes"), /\* -text whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol/);
  const preflight = json("evidence\\publication-preflight-001.json");
  assert.equal(preflight.exitCode, 2);
  assert.equal(preflight.spawnError, null);
  for (const stream of [preflight.stdout, preflight.stderr]) {
    const bytes = fs.readFileSync(path.join(repo, stream.path));
    assert.equal(bytes.length, stream.bytes);
    assert.equal(digest(bytes), stream.sha256);
  }
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
  assert.match(browser, /await openIsolatedLesson\("learning\\\\S026\\\\index\.html"\)/);
  assert.match(browser, /finally[\s\S]*await session\.close\(\)/);
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === "1"/);
  assert.doesNotMatch(browser, /--no-sandbox|ignoreHTTPSErrors|bypassCSP:\s*true|chromium\.launch/);
});

test("actual DOM observations include failure, unknown, keyboard, reset, CSP and awaited cleanup", () => {
  const observed = json("evidence\\browser-observations-001.json");
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
  for (const directive of ["script-src-elem", "script-src-attr", "connect-src"]) {
    assert.ok(csp.enforced.violations.some((item) => item.directive === directive));
  }
});

test("evidence and IaC N/A retain honest limits and parent-owned single-unit acceptance", () => {
  const evidence = json("evidence.json");
  assert.equal(evidence.cardId, "A-S026");
  assert.equal(evidence.parentId, "D-S026");
  assert.equal(evidence.packet, "SC-S026");
  assert.equal(evidence.kano, "S");
  assert.equal(evidence.mode, "synthetic-only");
  assert.equal(evidence.acceptedAtUtc, null);
  assert.equal(evidence.reviewer, null);
  assert.deepEqual(evidence.remainingLocalToDo, []);
  assert.equal(evidence.nativeRemainder.readiness, false);
  assert.match(evidence.nativeRemainder.blocker, /CORE, DATA and IMAGEHOST/);
  assert.match(evidence.userImpact, /UNMEASURED/);
  assert.equal(json("evidence\\iac-n-a.json").decision, "N/A");
  assert.equal(json("evidence\\iac-n-a.json").resourcesProvisioned, 0);
  assert.match(read("tests\\capture.cjs"), /flag: "wx"/);
  assert.match(read("tests\\verify.cjs"), /delete environment\.CAPTURE_BROWSER_EVIDENCE/);
  assert.match(read("tests\\verify.cjs"), /assert\.deepEqual\(after, before/);
});
