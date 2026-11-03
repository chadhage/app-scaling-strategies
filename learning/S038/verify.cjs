"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { hashes, proofHashes, digest, evidencePaths } = require("./capture.cjs");
const sealPath = evidencePaths().seal;
const seal = JSON.parse(fs.readFileSync(sealPath, "utf8"));
const before = { source: hashes(), proof: proofHashes(), seal: digest(fs.readFileSync(sealPath)) };
assert.deepEqual(before.source, seal.sourceHashes);
assert.deepEqual(before.proof, seal.proofHashes);
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
const tests = ["model.test.cjs", "syntax.test.cjs", "integrity.test.cjs", "browser.test.cjs"];
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", ...tests.map((file) => path.join(__dirname, "tests", file))], {
  cwd: path.resolve(__dirname, "..", ".."), env, encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024
});
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
assert.deepEqual(hashes(), before.source, "Normal verification changed lesson source.");
assert.deepEqual(proofHashes(), before.proof, "Normal verification changed historical proof.");
assert.equal(digest(fs.readFileSync(sealPath)), before.seal, "Normal verification changed the integrity inventory.");
if (result.error) throw result.error;
console.log(`Read-only verification: source, proof bytes and integrity inventory unchanged; child exit ${result.status}.`);
process.exitCode = result.status === null ? 1 : result.status;
