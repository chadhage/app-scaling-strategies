"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
if (process.env.CAPTURE_BROWSER_EVIDENCE !== "1") {
  throw new Error("Deliberate append-only capture requires CAPTURE_BROWSER_EVIDENCE=1.");
}
const [stage, ...args] = process.argv.slice(2);
if (!["red", "green", "browser", "tooling"].includes(stage) || !args.length) {
  throw new Error("Expected an explicit stage followed by Node arguments.");
}
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
const directory = path.join(root, "evidence");
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const relative = (file) => path.relative(repo, file);
const sources = [];
function scan(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
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
if (stage === "red") for (const local of ["readiness.js", "tests\\readiness.test.cjs", "readiness.feature"]) {
  const file = path.join(directory, `${name}-${path.basename(local)}.snapshot.txt`);
  const bytes = fs.readFileSync(path.join(root, local));
  fs.writeFileSync(file, bytes, { flag: "wx" });
  snapshots.push({ source: relative(path.join(root, local)), path: relative(file), sha256: digest(bytes) });
}
const startedAtUtc = new Date().toISOString();
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8", windowsHide: true });
const run = spawnSync(process.execPath, args, {
  cwd: repo, env: { ...process.env, FORCE_COLOR: "0", NODE_DISABLE_COLORS: "1" },
  encoding: null, windowsHide: true, maxBuffer: 8 * 1024 * 1024
});
function stream(kind, bytes) {
  const file = path.join(directory, `${name}.${kind}.txt`);
  fs.writeFileSync(file, bytes, { flag: "wx" });
  return { path: relative(file), bytes: bytes.length, sha256: digest(bytes) };
}
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
const record = {
  cardId: "A-S029", workerId: "worker-A-S029", packet: "SC-S029", kano: "S",
  stage, startedAtUtc, finishedAtUtc: new Date().toISOString(), command: [process.execPath, ...args],
  workingDirectory: repo, runtime: process.version, gitHeadBeforeRun: (head.stdout || "").trim(),
  captureBrowserEvidence: process.env.CAPTURE_BROWSER_EVIDENCE,
  exitCode: run.status, signal: run.signal, spawnError: run.error?.message || null,
  sources, snapshots, stdout: stream("stdout", stdout), stderr: stream("stderr", stderr),
  provenance: "Unmodified raw streams and source hashes; append-only deliberate capture, never automatic verification output."
};
fs.writeFileSync(path.join(directory, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`Capture: learning\\S029\\evidence\\${name}.json`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
