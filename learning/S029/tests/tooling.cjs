"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const helperSha256 = hash(fs.readFileSync(path.join(repo, "testing", "browser", "isolated.cjs")));
assert.equal(helperSha256, "86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055");
assert.equal(process.version, "v22.23.4");
const playwrightVersion = require(path.join(repo, "testing", "browser", "node_modules", "playwright", "package.json")).version;
assert.equal(playwrightVersion, "1.56.1");
const command = "$ErrorActionPreference='Stop'; $p='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'; "
  + "$s=Get-AuthenticodeSignature -LiteralPath $p; [ordered]@{path=$p;"
  + "version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion;status=$s.Status.ToString();"
  + "signer=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress";
const signature = spawnSync("pwsh.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
  cwd: repo, encoding: "utf8", windowsHide: true
});
assert.equal(signature.status, 0, signature.stderr || signature.error?.message);
const edge = JSON.parse(signature.stdout);
assert.match(edge.version, /^156\./);
assert.equal(edge.status, "Valid");
assert.match(edge.signer, /Microsoft Corporation/);
function source(local, prefix) {
  const bytes = fs.readFileSync(path.join(repo, local));
  const exactRow = bytes.toString("utf8").split(/\r?\n/).find((line) => line.startsWith(prefix));
  assert.ok(exactRow, prefix);
  return { path: local, sha256: hash(bytes), exactRow };
}
const kanban = fs.readFileSync(path.join(repo, ".docs", "wiki", "kanban.md"), "utf8");
const start = kanban.indexOf("## Atomic card contract");
const end = kanban.indexOf("## Concurrent pull and one-piece flow", start);
assert.ok(start >= 0 && end > start);
const ledger = JSON.parse(fs.readFileSync(path.join(repo, ".docs", "wiki", "flow-state.json"), "utf8"));
const card = ledger.cards.find((item) => item.id === "A-S029");
assert.equal(card.packet, "SC-S029");
assert.equal(card.kanoUnit, "A-S029");
assert.equal(card.kano, "S");
assert.equal(card.owner, "worker-A-S029");
assert.equal(card.authorization, "local-synthetic-only");
const record = {
  cardId: card.id, workerId: card.owner, recordedAtUtc: new Date().toISOString(),
  runtime: process.version, playwrightVersion, edge, helperSha256, helperPublishedCommit: "53c0c0d",
  signatureCommand: ["pwsh.exe", "-NoProfile", "-NonInteractive", "-Command", command],
  signatureRaw: { stdout: signature.stdout, stderr: signature.stderr, exitCode: signature.status },
  sources: [
    source("README.md", "| S029 |"),
    source(".docs\\wiki\\backlog.md", "| D-S029 |"),
    source(".docs\\wiki\\kanban.md", "| A-S029 |"),
    source(".docs\\wiki\\kanban.md", "| B-S029 |")
  ],
  atomicAndPortableContractVerbatim: kanban.slice(start, end),
  admittedCard: {
    id: card.id, parents: card.parents, packet: card.packet, kano: card.kano, kanoUnit: card.kanoUnit,
    deliver: card.deliver, technicalEntryGate: card.technicalEntryGate, authorization: card.authorization, owner: card.owner
  },
  limits: "Existing offline tooling only; not native Azure, production Node24 or source-parent certification. No downloads or unsafe flags."
};
if (process.env.CAPTURE_BROWSER_EVIDENCE === "1") {
  let index = 1;
  let file;
  do { file = path.join(root, "evidence", `source-contract-${String(index++).padStart(3, "0")}.json`); } while (fs.existsSync(file));
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
}
console.log(JSON.stringify(record, null, 2));
