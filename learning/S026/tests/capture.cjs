"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

if (process.env.CAPTURE_BROWSER_EVIDENCE !== "1") {
  throw new Error("Intentional capture only: set CAPTURE_BROWSER_EVIDENCE=1. Ordinary tests are read-only to proof.");
}
const [stage, ...args] = process.argv.slice(2);
if (!["red", "green", "syntax", "integrity", "browser", "tooling"].includes(stage) || args.length === 0) {
  throw new Error("Expected an explicit evidence stage and Node arguments.");
}
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
const directory = path.join(root, "evidence");
const relative = (file) => path.relative(repo, file);
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const sources = [];
function scan(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === "evidence") continue;
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) scan(file);
    else {
      const bytes = fs.readFileSync(file);
      sources.push({ path: relative(file), bytes: bytes.length, sha256: digest(bytes) });
    }
  }
}
scan(root);
fs.mkdirSync(directory, { recursive: true });
let index = 1;
while (fs.existsSync(path.join(directory, `${stage}-${String(index).padStart(3, "0")}.json`))) index++;
const name = `${stage}-${String(index).padStart(3, "0")}`;
const snapshots = [];
if (stage === "red") {
  for (const local of ["startup.js", "tests\\startup.test.cjs", "image-startup.feature"]) {
    const source = path.join(root, local);
    const snapshot = path.join(directory, `${name}-${path.basename(local)}.snapshot.txt`);
    fs.writeFileSync(snapshot, fs.readFileSync(source), { flag: "wx" });
    snapshots.push({ source: relative(source), path: relative(snapshot), sha256: digest(fs.readFileSync(snapshot)) });
  }
}
const startedAtUtc = new Date().toISOString();
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8", windowsHide: true });
const result = spawnSync(process.execPath, args, {
  cwd: repo, env: { ...process.env, FORCE_COLOR: "0", NODE_DISABLE_COLORS: "1" },
  encoding: null, windowsHide: true, maxBuffer: 8 * 1024 * 1024
});
function raw(kind, bytes) {
  const file = path.join(directory, `${name}.${kind}.txt`);
  fs.writeFileSync(file, bytes, { flag: "wx" });
  return { path: relative(file), bytes: bytes.length, sha256: digest(bytes) };
}
const stdout = result.stdout || Buffer.alloc(0);
const stderr = result.stderr || Buffer.alloc(0);
const record = {
  cardId: "A-S026", workerId: "worker-A-S026", packet: "SC-S026", kano: "S",
  stage, startedAtUtc, finishedAtUtc: new Date().toISOString(),
  command: [process.execPath, ...args], workingDirectory: repo,
  runtime: process.version, gitHeadBeforeRun: (head.stdout || "").trim(),
  captureBrowserEvidence: process.env.CAPTURE_BROWSER_EVIDENCE,
  exitCode: result.status, signal: result.signal, spawnError: result.error?.message || null,
  sources, snapshots, stdout: raw("stdout", stdout), stderr: raw("stderr", stderr),
  provenance: "Raw stdout/stderr bytes are unmodified. Capture appends; ordinary verification writes no proof."
};
fs.writeFileSync(path.join(directory, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`Capture: learning\\S026\\evidence\\${name}.json`);
process.exitCode = Number.isInteger(result.status) ? result.status : 1;
