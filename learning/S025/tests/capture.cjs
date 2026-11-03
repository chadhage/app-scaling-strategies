"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

if (process.env.CAPTURE_BROWSER_EVIDENCE !== "1") {
  throw new Error("Intentional capture only: set CAPTURE_BROWSER_EVIDENCE=1. Ordinary tests preserve proof.");
}
const [stage, ...args] = process.argv.slice(2);
if (!["red", "green", "syntax", "integrity", "browser", "tooling"].includes(stage) || !args.length) {
  throw new Error("Expected an explicit stage and Node arguments.");
}
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
const evidence = path.join(root, "evidence");
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const sources = [];
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "evidence") continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else {
      const bytes = fs.readFileSync(file);
      sources.push({ path: path.relative(repo, file), sha256: digest(bytes), bytes: bytes.length });
    }
  }
}
scan(root);
fs.mkdirSync(evidence, { recursive: true });
let index = 1;
while (fs.existsSync(path.join(evidence, `${stage}-${String(index).padStart(3, "0")}.json`))) index++;
const name = `${stage}-${String(index).padStart(3, "0")}`;
const snapshots = [];
if (stage === "red") {
  for (const local of ["warmup.js", "tests\\warmup.test.cjs", "runtime-warmup.feature"]) {
    const source = path.join(root, local);
    const file = path.join(evidence, `${name}-${path.basename(local)}.snapshot.txt`);
    fs.writeFileSync(file, fs.readFileSync(source), { flag: "wx" });
    snapshots.push({ source: path.relative(repo, source), path: path.relative(repo, file),
      sha256: digest(fs.readFileSync(file)) });
  }
}
const startedAtUtc = new Date().toISOString();
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8", windowsHide: true });
const result = spawnSync(process.execPath, args, {
  cwd: repo, windowsHide: true, encoding: null, maxBuffer: 8 * 1024 * 1024,
  env: { ...process.env, FORCE_COLOR: "0", NODE_DISABLE_COLORS: "1" }
});
function raw(kind, bytes) {
  const file = path.join(evidence, `${name}.${kind}.json`);
  fs.writeFileSync(file, `${JSON.stringify({
    encoding: "base64", bytes: bytes.length, sha256: digest(bytes),
    data: bytes.toString("base64"), utf8: bytes.toString("utf8")
  }, null, 2)}\n`, { flag: "wx" });
  return path.relative(repo, file);
}
const stdout = result.stdout || Buffer.alloc(0);
const stderr = result.stderr || Buffer.alloc(0);
const record = {
  stage, cardId: "A-S025", workerId: "worker-A-S025",
  startedAtUtc, finishedAtUtc: new Date().toISOString(),
  command: [process.execPath, ...args], workingDirectory: repo,
  captureBrowserEvidence: process.env.CAPTURE_BROWSER_EVIDENCE,
  runtime: process.version, gitHeadBeforeRun: (head.stdout || "").trim(),
  exitCode: result.status, signal: result.signal, spawnError: result.error?.message || null,
  sources, snapshots, stdout: raw("stdout", stdout), stderr: raw("stderr", stderr),
  note: "Base64 is lossless runner output; utf8 is untrimmed. Captures append, never overwrite."
};
fs.writeFileSync(path.join(evidence, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`Capture: learning\\S025\\evidence\\${name}.json`);
process.exitCode = Number.isInteger(result.status) ? result.status : 1;
