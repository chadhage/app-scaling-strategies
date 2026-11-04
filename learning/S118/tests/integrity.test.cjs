"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { gunzipSync } = require("node:zlib");
const { assetFiles, lessonRoot, sha256, sourceHashes, captureBrowserReport } = require("..\\scripts\\evidence.cjs");

const read = (file) => fs.readFileSync(path.join(lessonRoot, file));
const json = (file) => JSON.parse(read(file).toString("utf8"));

test("CSP authorizes only the exact theme blocks and local code, with no unsafe or network capability", () => {
  const html = read("index.html").toString("utf8");
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  for (const tag of ["script", "style"]) {
    const block = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(html)[1];
    const hash = require("node:crypto").createHash("sha256").update(block.replace(/\r\n?/g, "\n")).digest("base64");
    assert.ok(csp.includes(`'sha256-${hash}'`));
  }
  for (const directive of ["default-src", "connect-src", "img-src", "font-src", "media-src",
    "object-src", "frame-src", "base-uri", "form-action"]) assert.ok(csp.includes(`${directive} 'none'`));
  assert.doesNotMatch(csp, /unsafe-|https?:|data:|blob:|\*/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]), ["model.js", "app.js"]);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|(?:src|href)="(?:https?:|\/\/)/i);
  assert.ok(html.indexOf("Content-Security-Policy") < html.indexOf("<script>"));
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status" aria-live="polite"/);
});

test("lesson code is fixed teaching data, not network, storage, identity or infrastructure operations", () => {
  for (const file of ["model.js", "app.js"]) {
    const source = read(file).toString("utf8");
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|setInterval|setTimeout|Date)\b|document\.cookie|Math\.random|https?:\/\//);
  }
  assert.match(read("model.js").toString("utf8"), /fixed-fictional-teaching-data/);
  assert.equal(json("evidence\\iac-na.json").iacGenerated, false);
  assert.equal(json("evidence\\iac-na.json").iacValidated, false);
});

test("RED is preserved as exact raw proof and loadable stub sources outside test autodiscovery", () => {
  for (const filename of ["model-red.json", "browser-red.json"]) {
    const proof = json(`evidence\\red\\${filename}`);
    assert.equal(proof.exitCode, 1);
    assert.equal(proof.signal, null);
    assert.equal(proof.error, null);
    assert.equal(proof.assertionObserved, true);
    for (const [file, expected] of Object.entries(proof.hashes)) {
      assert.equal(sha256(read(`evidence\\red\\${file}`)), expected);
    }
  }
  assert.match(read("evidence\\red\\model-stdout.raw").toString("utf8"), /ERR_ASSERTION/);
  assert.match(read("evidence\\red\\model-stdout.raw").toString("utf8"), /actual: 'unknown'/);
  assert.match(read("evidence\\red\\browser-stderr.raw").toString("utf8"), /'idle' !== 'mutated'/);
  const sandbox = { module: { exports: {} } };
  require("node:vm").runInNewContext(read("evidence\\red\\model.stub").toString("utf8"), sandbox);
  assert.equal(typeof sandbox.module.exports.Rehearsal, "function");
  assert.equal(new sandbox.module.exports.Rehearsal().measure().outcome, "unknown");
  assert.ok(fs.readdirSync(path.join(lessonRoot, "evidence", "red")).every((file) => !/\.(?:cjs|js)$/.test(file)));
  for (const pattern of ["evidence/red/*.stub", "evidence/red/*.source", "evidence/**/*.raw", "evidence/**/*.gz"]) {
    assert.ok(read(".gitattributes").toString("utf8").includes(`${pattern} -text -diff`));
  }
});

test("text hashes and canonical Git blobs are distinct fields; raw CRLF evidence is never normalized", () => {
  for (const [file, asset] of Object.entries(sourceHashes())) {
    assert.match(asset.rawSha256, /^[a-f0-9]{64}$/);
    assert.match(asset.rawGitBlob, /^[a-f0-9]{40}$/);
    assert.match(asset.canonicalGitBlob, /^[a-f0-9]{40}$/);
    const raw = read(file);
    const canonical = Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"));
    const canonicalBlob = execFileSync("git", ["hash-object", "--no-filters", "--stdin"], {
      input: canonical, encoding: "utf8", windowsHide: true,
    }).trim();
    assert.equal(asset.canonicalGitBlob, canonicalBlob);
    if (raw.includes(Buffer.from("\r\n"))) assert.notEqual(asset.rawGitBlob, asset.canonicalGitBlob);
    else assert.equal(asset.rawGitBlob, asset.canonicalGitBlob);
  }
  assert.equal(assetFiles.length, 12);
  assert.match(read(".gitattributes").toString("utf8"), /^\* text eol=lf/m);
});

test("only the exact deliberate browser-capture switch authorizes evidence writes", () => {
  const previous = process.env.CAPTURE_BROWSER_EVIDENCE;
  try {
    for (const value of [undefined, "", "0", "true", "01", "1 "]) {
      if (value === undefined) delete process.env.CAPTURE_BROWSER_EVIDENCE;
      else process.env.CAPTURE_BROWSER_EVIDENCE = value;
      assert.equal(captureBrowserReport({}), null);
    }
  } finally {
    if (previous === undefined) delete process.env.CAPTURE_BROWSER_EVIDENCE;
    else process.env.CAPTURE_BROWSER_EVIDENCE = previous;
  }
});

test("latest actual browser evidence binds the final assets and records real local UI observations", () => {
  const files = fs.readdirSync(path.join(lessonRoot, "evidence")).filter((file) => /^browser-.*\.json$/.test(file)).sort();
  assert.ok(files.length, "Deliberately capture actual browser evidence once before final verification.");
  const report = json(`evidence\\${files.at(-1)}`);
  assert.equal(report.passed, true);
  assert.equal(report.helperSha256, "86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055");
  assert.equal(report.playwrightVersion, "1.56.1");
  assert.match(report.browserVersion, /^156\./);
  const current = sourceHashes();
  assert.deepEqual(Object.keys(report.assets), Object.keys(current));
  const archive = read(`evidence\\${report.rawSourceProof.file}`);
  assert.equal(sha256(archive), report.rawSourceProof.sha256);
  const sourceBytes = JSON.parse(gunzipSync(archive).toString("utf8"));
  for (const file of assetFiles) {
    assert.equal(report.assets[file].canonicalGitBlob, current[file].canonicalGitBlob);
    const originalRaw = Buffer.from(sourceBytes[file], "base64");
    assert.equal(sha256(originalRaw), report.assets[file].rawSha256);
    const hashBlob = (bytes) => execFileSync("git", ["hash-object", "--no-filters", "--stdin"], {
      input: bytes, encoding: "utf8", windowsHide: true,
    }).trim();
    assert.equal(hashBlob(originalRaw), report.assets[file].rawGitBlob);
    assert.equal(hashBlob(Buffer.from(originalRaw.toString("utf8").replace(/\r\n/g, "\n"))),
      current[file].canonicalGitBlob);
  }
  for (const kind of ["keyboard", "input-error", "phase-error", "retained-history-reset",
    "bounded-history", "positive", "duplicate", "identity-lost", "session-lost", "route-pending",
    "late", "unconfirmed", "unavailable", "csp", "engine-failure", "narrow-viewport"]) {
    assert.ok(report.observations.some((item) => item.kind === kind), kind);
  }
  assert.equal(report.nativeAzureValidated, false);
  assert.equal(report.sourceParentAccepted, false);
  assert.equal(report.iacValidated, false);
  assert.equal(report.productionNode24Validated, false);
  assert.equal(report.lessonFilesUnchangedDuringObservation, true);
});
