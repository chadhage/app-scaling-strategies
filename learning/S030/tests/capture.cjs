"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
if (process.env.CAPTURE_BROWSER_EVIDENCE !== "1") throw new Error("Deliberate append-only capture requires CAPTURE_BROWSER_EVIDENCE=1.");
const [stage, ...args] = process.argv.slice(2);
if (!["source", "red", "green", "browser", "verification"].includes(stage) || !args.length) throw new Error("Expected an evidence stage and explicit Node arguments.");
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
const evidence = path.join(root, "evidence");
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const relative = (file) => path.relative(repo, file);
fs.mkdirSync(evidence, { recursive: true });
let index = 1;
while (fs.existsSync(path.join(evidence, `${stage}-${String(index).padStart(3, "0")}.json`))) index++;
const name = `${stage}-${String(index).padStart(3, "0")}`;
const sources = [];
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "evidence") continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else {
      const bytes = fs.readFileSync(file);
      sources.push({ path: relative(file), bytes: bytes.length, sha256: digest(bytes) });
    }
  }
}
scan(root);
const snapshots = [];
if (stage === "red") {
  for (const local of ["warmup.js", "tests\\warmup.test.cjs", "warmup.feature"]) {
    const source = path.join(root, local);
    const target = path.join(evidence, `${name}-${path.basename(local)}.snapshot.txt`);
    const bytes = fs.readFileSync(source);
    fs.writeFileSync(target, bytes, { flag: "wx" });
    snapshots.push({ source: relative(source), path: relative(target), sha256: digest(bytes) });
  }
}
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8", windowsHide: true });
const startedAtUtc = new Date().toISOString();
const result = spawnSync(process.execPath, args, {
  cwd: repo, env: { ...process.env, FORCE_COLOR: "0", NODE_DISABLE_COLORS: "1" },
  encoding: null, windowsHide: true, maxBuffer: 8 * 1024 * 1024
});
function raw(kind, bytes) {
  const file = path.join(evidence, `${name}.${kind}.txt`);
  fs.writeFileSync(file, bytes, { flag: "wx" });
  return { path: relative(file), bytes: bytes.length, sha256: digest(bytes) };
}
const stdout = result.stdout || Buffer.alloc(0);
const stderr = result.stderr || Buffer.alloc(0);
const record = {
  cardId: "A-S030", workerId: "worker-A-S030", packet: "SC-S030", kano: "S",
  stage, startedAtUtc, finishedAtUtc: new Date().toISOString(),
  command: [process.execPath, ...args], workingDirectory: repo,
  runtime: process.version, gitHeadBeforeRun: (head.stdout || "").trim(),
  captureBrowserEvidence: process.env.CAPTURE_BROWSER_EVIDENCE,
  exitCode: result.status, signal: result.signal, spawnError: result.error?.message || null,
  sources, snapshots, stdout: raw("stdout", stdout), stderr: raw("stderr", stderr),
  provenance: "Unmodified raw stream bytes. Append-only deliberate capture; ordinary verification is read-only to proof."
};
fs.writeFileSync(path.join(evidence, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`Capture: learning\\S030\\evidence\\${name}.json`);
process.exitCode = Number.isInteger(result.status) ? result.status : 1;
