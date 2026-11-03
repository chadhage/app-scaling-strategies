"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { hashes, proofHashes, digest, evidencePaths } = require("../capture.cjs");
const { replay } = require("./replay-red.cjs");
const root = path.resolve(__dirname, "..");
const evidence = path.join(root, "evidence");
const json = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

test("exact S038 source, portable contract, frozen S packet and IaC N/A remain explicit", () => {
  const source = json("evidence\\source-contract.json");
  assert.equal(source.exactRows.source, "| S038 | **Tenant authorization continuity:** Preserve permissions and isolation after routing changes. |");
  assert.match(source.exactRows.backlog, /Tenant permissions and isolation hold on every reachable version; forbidden access is explicitly rejected/);
  assert.equal(source.exactRows.portable, "| A-S038 | D-S038 | S | Change destinations for two tenants; select assertions that expose cross-tenant access. | SOURCE |");
  assert.equal(source.cardId, "A-S038");
  assert.equal(source.kanoUnit, "A-S038");
  assert.equal(source.kano, "S");
  assert.equal(source.packet, "SC-S038");
  assert.equal(source.claim.owner, "worker-A-S038");
  assert.match(source.atomicAndPortableContract, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(source.packetRule, /every other A\/B card belongs to SC-Snnn/);
  const manifest = json("manifest.json");
  assert.equal(manifest.syntheticInput.probesPerRun, 16);
  assert.equal(manifest.syntheticInput.maxRetainedRuns, 6);
  assert.equal(manifest.banner, "Training rehearsal - synthetic data - not a live Azure result");
  assert.equal(json("evidence\\iac-na.json").status, "N/A");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const paragraph of source.disclaimer.split(/\r?\n\r?\n/).slice(1)) {
    if (paragraph.trim()) assert.ok(html.includes(paragraph.trim()), "Full exact source disclaimer is shown.");
  }
});

test("original BDD, importable stub and genuine failed assertion are retained and reproducible", () => {
  const red = json("evidence\\red.raw.json");
  const load = json("evidence\\stub-load.raw.json");
  assert.equal(load.exitCode, 0);
  assert.equal(red.exitCode, 1);
  assert.match(Buffer.from(red.stdoutBase64, "base64").toString("utf8"), /ERR_ASSERTION/);
  assert.doesNotMatch(Buffer.from(red.stderrBase64, "base64").toString("utf8"), /MODULE_NOT_FOUND|SyntaxError/);
  assert.equal(digest(fs.readFileSync(path.join(evidence, "red", "authorization.source.snapshot"))), red.sourceHashes["authorization.js"]);
  assert.equal(digest(fs.readFileSync(path.join(evidence, "red", "assertion.source.snapshot"))), red.sourceHashes["tests\\model.test.cjs"]);
  assert.equal(digest(fs.readFileSync(path.join(evidence, "red", "bdd.feature.snapshot"))), red.sourceHashes["tenant-authorization.feature"]);
  assert.equal(fs.readFileSync(path.join(evidence, "red", "bdd.feature.snapshot"), "utf8"), fs.readFileSync(path.join(root, "tenant-authorization.feature"), "utf8"));
  assert.equal(replay().status, 1);
});

test("raw command captures preserve exact stdout/stderr bytes, source hashes and exit provenance", () => {
  const files = fs.readdirSync(evidence).filter((file) => file.endsWith(".raw.json"));
  assert.ok(files.length >= 3);
  for (const file of files) {
    const raw = json(`evidence\\${file}`);
    const stdout = Buffer.from(raw.stdoutBase64, "base64");
    const stderr = Buffer.from(raw.stderrBase64, "base64");
    assert.equal(digest(stdout), raw.stdoutSha256);
    assert.equal(digest(stderr), raw.stderrSha256);
    assert.equal(digest(fs.readFileSync(path.join(evidence, `${raw.label}.stdout.txt`))), raw.stdoutSha256);
    assert.equal(digest(fs.readFileSync(path.join(evidence, `${raw.label}.stderr.txt`))), raw.stderrSha256);
    assert.equal(raw.node, "v22.23.4");
    assert.equal(raw.signal, null);
    assert.equal(raw.error, null);
    assert.ok(Date.parse(raw.completedAtUtc) >= Date.parse(raw.startedAtUtc));
    assert.ok(Object.keys(raw.sourceHashes).length >= 5);
  }
});

test("recorded browser qualification uses only the published helper and awaited finally cleanup", () => {
  const tooling = json("evidence\\tooling.json");
  assert.equal(tooling.node, "v22.23.4");
  assert.equal(tooling.playwright, "1.56.1");
  assert.equal(tooling.edgeVersion, "156.0.4314.50");
  assert.equal(tooling.signatureStatus, "Valid");
  assert.match(tooling.signer, /Microsoft Corporation/);
  const records = fs.readdirSync(evidence).filter((file) => /^browser-\d{3}\.json$/.test(file)).map((file) => json(`evidence\\${file}`));
  assert.ok(records.length >= 1, "Deliberate real-browser evidence must exist.");
  const qualified = records.at(-1);
  assert.equal(qualified.verifier, "PASS");
  assert.equal(qualified.observations.length, 13);
  assert.ok(qualified.observations.every((item) => item.passed));
  assert.equal(qualified.awaitedFinallyClose, true);
  assert.equal(qualified.helperSha256, "86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055");
  assert.equal(qualified.helperCommit, "53c0c0d82cc1db6780a87ac2b1085734af6d5c60");
  assert.equal(qualified.browserVersion, "156.0.4314.50");
  assert.deepEqual(qualified.pageErrors, []);
  assert.deepEqual(qualified.networkAttempts, []);
  assert.equal(qualified.lifecycleError, null);
  assert.equal(qualified.cleanupError, null);
  assert.deepEqual(qualified.sourceHashes, hashes(), "The latest captured browser observations qualify the exact current source.");
});

test("current source and manifest match the qualified baseline; sealed proof remains byte-for-byte unchanged", () => {
  const paths = evidencePaths();
  const baseline = JSON.parse(fs.readFileSync(paths.baseline, "utf8"));
  assert.deepEqual(hashes(), baseline.sourceHashes);
  assert.equal(digest(fs.readFileSync(path.join(root, "evidence.json"))), baseline.evidenceManifestSha256);
  const sealPath = paths.seal;
  if (fs.existsSync(sealPath)) {
    const seal = JSON.parse(fs.readFileSync(sealPath, "utf8"));
    assert.deepEqual(hashes(), seal.sourceHashes);
    assert.deepEqual(proofHashes(), seal.proofHashes);
  }
});
