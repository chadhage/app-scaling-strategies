"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = __dirname;
const repo = path.resolve(root, "..", "..");
const evidence = path.join(root, "evidence");
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function hashes(directory = root) {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (["evidence", "evidence.json", "worker-result.json"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, hashes(file));
    else result[path.relative(root, file).split(path.sep).join("\\")] = digest(fs.readFileSync(file));
  }
  return result;
}

function writeNew(name, value) {
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, name), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

function evidencePaths() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "evidence.json"), "utf8"));
  function resolve(key, prefix) {
    const relative = manifest[key].replaceAll("\\", "/");
    const name = relative.slice("evidence/".length);
    if (!relative.startsWith("evidence/") || !new RegExp(`^${prefix}(?:-\\d{3})?\\.json$`).test(name)) {
      throw new Error(`Invalid owned ${key} path.`);
    }
    return path.join(evidence, name);
  }
  return { baseline: resolve("sourceHashes", "source-hashes"), seal: resolve("proofIntegrity", "integrity") };
}

function proofHashes() {
  const result = {};
  const activeSeal = evidencePaths().seal;
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (file !== activeSeal) {
        result[path.relative(root, file).split(path.sep).join("\\")] = digest(fs.readFileSync(file));
      }
    }
  }
  visit(evidence);
  result["evidence.json"] = digest(fs.readFileSync(path.join(root, "evidence.json")));
  return result;
}

function baseline() {
  writeNew(path.basename(evidencePaths().baseline), { sourceHashes: hashes(), evidenceManifestSha256: digest(fs.readFileSync(path.join(root, "evidence.json"))) });
}

function seal() {
  const paths = evidencePaths();
  const baselineRecord = JSON.parse(fs.readFileSync(paths.baseline, "utf8"));
  const assert = require("node:assert/strict");
  assert.deepEqual(hashes(), baselineRecord.sourceHashes, "Source changed after its qualified baseline.");
  assert.equal(digest(fs.readFileSync(path.join(root, "evidence.json"))), baselineRecord.evidenceManifestSha256);
  writeNew(path.basename(paths.seal), {
    sealedAtUtc: new Date().toISOString(),
    cardId: "A-S038", sourceHashes: hashes(), proofHashes: proofHashes(),
    qualification: "Byte-integrity inventory, not evidence signing or native certification. Normal verification never writes proof."
  });
}

function source() {
  const read = (file) => fs.readFileSync(path.join(repo, file), "utf8");
  const readme = read("README.md");
  const backlog = read(".docs\\wiki\\backlog.md");
  const kanban = read(".docs\\wiki\\kanban.md");
  const exact = (text, prefix) => {
    const rows = text.split(/\r?\n/).filter((line) => line.startsWith(prefix));
    if (rows.length !== 1) throw new Error(`Expected one exact source row: ${prefix}`);
    return rows[0];
  };
  const ledger = JSON.parse(read(".docs\\wiki\\flow-state.json"));
  const card = ledger.cards.find((item) => item.id === "A-S038");
  if (card.owner !== "worker-A-S038" || card.state !== "In Progress" || card.kano !== "S" || card.packet !== "SC-S038") {
    throw new Error("Claim or frozen card contract mismatch.");
  }
  writeNew("source-contract.json", {
    capturedAtUtc: new Date().toISOString(),
    cardId: "A-S038", parentId: "D-S038", packet: "SC-S038", kanoUnit: "A-S038", kano: "S",
    claim: card,
    exactRows: {
      source: exact(readme, "| S038 |"),
      backlog: exact(backlog, "| D-S038 |"),
      portable: exact(kanban, "| A-S038 |"),
      nativeRemainder: exact(kanban, "| B-S038 |")
    },
    atomicAndPortableContract: kanban.slice(kanban.indexOf("## Atomic card contract"), kanban.indexOf("## Concurrent pull")),
    packetRule: kanban.split(/\r?\n/).find((line) => line.startsWith("Packet membership is fixed before admission.")),
    disclaimer: readme.slice(readme.indexOf("## Microsoft Open Source Disclaimer"), readme.indexOf("## Sources")),
    sources: Object.fromEntries(["README.md", ".docs\\wiki\\backlog.md", ".docs\\wiki\\kanban.md"].map((file) => [file, digest(fs.readFileSync(path.join(repo, file)))])),
    implementationHead: spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout.trim()
  });
}

function capture(label, args) {
  if (!/^[a-z][a-z0-9-]{0,60}$/.test(label) || !args.length) throw new Error("A bounded label and Node arguments are required.");
  if (fs.existsSync(path.join(evidence, `${label}.raw.json`))) throw new Error("Capture is append-only; choose a fresh label.");
  if (args.some((arg) => /browser\.test\.cjs$/.test(arg)) && process.env.CAPTURE_BROWSER_EVIDENCE !== "1") {
    throw new Error("Intentional browser capture requires CAPTURE_BROWSER_EVIDENCE=1.");
  }
  const startedAtUtc = new Date().toISOString();
  const sourceHashes = hashes();
  const child = spawnSync(process.execPath, args, { cwd: repo, encoding: null, timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  const stdout = child.stdout || Buffer.alloc(0);
  const stderr = child.stderr || Buffer.alloc(0);
  const record = {
    label, startedAtUtc, completedAtUtc: new Date().toISOString(), cwd: repo,
    executable: process.execPath, arguments: args, node: process.version, platform: process.platform,
    exitCode: child.status, signal: child.signal, error: child.error ? child.error.message : null,
    sourceHashes, stdoutSha256: digest(stdout), stderrSha256: digest(stderr),
    stdoutBase64: stdout.toString("base64"), stderrBase64: stderr.toString("base64"),
    captureBrowserEvidence: process.env.CAPTURE_BROWSER_EVIDENCE === "1"
  };
  writeNew(`${label}.stdout.txt`, stdout.toString("utf8"));
  writeNew(`${label}.stderr.txt`, stderr.toString("utf8"));
  writeNew(`${label}.raw.json`, record);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = child.status === null ? 1 : child.status;
}

if (require.main === module) {
  const [action, ...args] = process.argv.slice(2);
  if (action === "source") source();
  else if (action === "baseline") baseline();
  else if (action === "seal") seal();
  else capture(action, args);
}
module.exports = { hashes, proofHashes, digest, evidencePaths };
