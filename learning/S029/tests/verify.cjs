"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function proofSnapshot() {
  const files = [];
  function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else files.push([path.relative(root, file), digest(fs.readFileSync(file))]);
    }
  }
  scan(path.join(root, "evidence"));
  files.push(["evidence.json", digest(fs.readFileSync(path.join(root, "evidence.json")))]);
  return files.sort(([left], [right]) => left.localeCompare(right));
}
const before = proofSnapshot();
const environment = { ...process.env };
delete environment.CAPTURE_BROWSER_EVIDENCE;
const args = ["--test", "--test-concurrency=1", "--test-reporter=tap",
  ...["readiness", "syntax", "integrity", "browser"].map((name) => path.join(__dirname, `${name}.test.cjs`))];
const result = spawnSync(process.execPath, args, {
  cwd: repo, env: environment, encoding: null, windowsHide: true, maxBuffer: 8 * 1024 * 1024
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
const after = proofSnapshot();
assert.deepEqual(after, before, "Ordinary verification must preserve historical proof bytes and inventory.");
console.log(JSON.stringify({
  normalVerificationReadOnly: true, proofFiles: before.length,
  beforeSha256: digest(JSON.stringify(before)), afterSha256: digest(JSON.stringify(after)),
  childCaptureBrowserEvidence: null, childExitCode: result.status, childSpawnError: result.error?.message || null
}));
process.exitCode = Number.isInteger(result.status) ? result.status : 1;
