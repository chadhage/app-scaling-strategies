"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { gzipSync } = require("node:zlib");

const lessonRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(lessonRoot, "..", "..");
const assetFiles = [
  ".gitattributes", "README.txt", "global-failover.feature", "index.html", "styles.css", "model.js", "app.js",
  "scripts\\evidence.cjs", "scripts\\browser.cjs", "scripts\\csp-probe.js", "tests\\model.test.cjs", "tests\\integrity.test.cjs",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function sourceHashes() {
  return Object.fromEntries(assetFiles.map((file) => {
    const absolute = path.join(lessonRoot, file);
    const relative = path.relative(repoRoot, absolute);
    const gitBlob = (args) => execFileSync("git", ["hash-object", ...args, absolute], {
      cwd: repoRoot, encoding: "utf8", windowsHide: true,
    }).trim();
    return [file, {
      rawSha256: sha256(fs.readFileSync(absolute)),
      rawGitBlob: gitBlob(["--no-filters"]),
      canonicalGitBlob: gitBlob(["--path", relative]),
    }];
  }));
}

function ownedFileHashes(directory = lessonRoot) {
  const hashes = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(hashes, ownedFileHashes(absolute));
    else hashes[path.relative(lessonRoot, absolute)] = sha256(fs.readFileSync(absolute));
  }
  return hashes;
}

function captureBrowserReport(report) {
  if (process.env.CAPTURE_BROWSER_EVIDENCE !== "1") return null;
  const filename = `browser-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.json`;
  const sourceBytes = Object.fromEntries(assetFiles.map((file) => {
    const bytes = fs.readFileSync(path.join(lessonRoot, file));
    if (sha256(bytes) !== report.assets[file].rawSha256) throw new Error("Source bytes changed before deliberate capture.");
    return [file, bytes.toString("base64")];
  }));
  const archive = gzipSync(Buffer.from(JSON.stringify(sourceBytes)));
  const archiveFile = filename.replace(/\.json$/, ".sources.raw.gz");
  fs.writeFileSync(path.join(lessonRoot, "evidence", archiveFile), archive, { flag: "wx" });
  report.rawSourceProof = { file: archiveFile, sha256: sha256(archive) };
  fs.writeFileSync(path.join(lessonRoot, "evidence", filename), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return path.join("learning", "S118", "evidence", filename);
}

module.exports = { lessonRoot, repoRoot, assetFiles, sha256, sourceHashes, ownedFileHashes, captureBrowserReport };
