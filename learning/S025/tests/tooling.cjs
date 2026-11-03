"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const repo = path.resolve(__dirname, "..", "..", "..");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const helper = path.join(repo, "testing", "browser", "isolated.cjs");
const helperSha256 = sha256(helper);
const playwright = require(path.join(repo, "testing", "browser", "node_modules", "playwright", "package.json")).version;
assert.equal(process.version, "v22.23.4");
assert.equal(playwright, "1.56.1");
assert.equal(helperSha256, "86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055");
const command = [
  "$ErrorActionPreference='Stop'",
  "$p='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'",
  "$s=Get-AuthenticodeSignature -LiteralPath $p",
  "[ordered]@{path=$p;version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;signatureStatus=$s.Status.ToString();signerSubject=$s.SignerCertificate.Subject} | ConvertTo-Json -Compress"
].join("; ");
const signature = spawnSync("C:\\Program Files\\PowerShell\\7\\pwsh.exe",
  ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
  { encoding: "utf8", windowsHide: true });
assert.equal(signature.status, 0, signature.stderr);
const browser = JSON.parse(signature.stdout);
assert.match(browser.version, /^156\./);
assert.equal(browser.signatureStatus, "Valid");
assert.match(browser.signerSubject, /Microsoft Corporation/);
console.log(JSON.stringify({
  node: process.version, playwright, helperSha256, helperPublishedCommit: "53c0c0d",
  browser, browserSha256: sha256(browser.path),
  signatureCommand: command, signatureStdout: signature.stdout, signatureStderr: signature.stderr,
  noPackagesInstalled: true, noBrowserDownloaded: true,
  limit: "Existing offline tooling only. No Node24, native Java/Azure, production or unattended lifecycle certification."
}, null, 2));
