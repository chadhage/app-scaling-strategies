"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
if (process.env.CAPTURE_BROWSER_EVIDENCE !== "1") throw new Error("Intentional initial manifest capture requires CAPTURE_BROWSER_EVIDENCE=1.");
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const sourceHashes = [];
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "evidence" || entry.name === "evidence.json") continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else sourceHashes.push({ path: path.relative(repo, file), sha256: digest(fs.readFileSync(file)) });
  }
}
scan(root);
const browser = process.argv[2] || "browser-observations-001.json";
if (!/^browser-observations-\d{3}\.json$/.test(browser)) throw new Error("Expected an owned browser observation filename.");
const observation = JSON.parse(fs.readFileSync(path.join(root, "evidence", browser), "utf8"));
if (observation.observations.length !== 14 || !observation.observations.every((item) => item.passed)
    || !observation.awaitedFinallyCloseResolved || observation.cleanupError || observation.topLevelError) {
  throw new Error("A complete actual-browser observation with resolved cleanup is required.");
}
const record = {
  cardId: "A-S030", parentId: "D-S030", workerId: "worker-A-S030",
  packet: "SC-S030", kano: "S", kanoUnit: "A-S030", mode: "deterministic-synthetic-browser-lesson",
  sourceId: "S030", objective: "Limit initialization concurrency so candidate preparation does not overwhelm shared dependencies.",
  entry: "index.html", recordedAtUtc: new Date().toISOString(),
  preconditions: "Fixed four-journey baseline; compatible isolated candidates; two-tick initialization; declared synthetic dependency and duration budgets.",
  sourceContract: "evidence\\source-contract-001.json",
  bdd: "warmup.feature", behavioralRed: "evidence\\red-001.json",
  iac: "evidence\\iac-na.json", focusedModelGreen: "evidence\\green-001.json",
  principalBrowserObservation: `evidence\\${browser}`,
  verificationCommand: "node .\\learning\\S030\\tests\\verify.cjs",
  modelChecks: 24, sampledConfigurations: 1386, browserLeafChecks: 14, browserParentGroups: 1,
  verifier: "Operator prediction is PASS/FAIL independently of SUCCESS/FAILURE/UNKNOWN synthetic run outcomes.",
  userImpact: "Synthetic fixture only; real users UNMEASURED.",
  cleanup: "Resource-free lesson; browser observation records awaited finally close. Reset clears only this in-memory lesson.",
  runtime: "Node 22.23.4 tooling only", playwrightVersion: "1.56.1", edgeVersion: "156.0.4314.50",
  browserHelperCommit: "53c0c0d", browserHelperSha256: "86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055",
  lifecycleLimit: "Published helper has a documented unattended lifecycle limitation. No abandoned prototype qualification is inferred.",
  nativeQualified: false, sourceParentComplete: false, productionNode24Qualified: false,
  acceptance: "Parent-owned independent review pending; worker awards no Done credit.",
  relevantToDo: [{
    id: "B-S030", readiness: false,
    blocker: "Separate CORE, DATA, HOST gates, qualified native target/access, native warm-up and live-journey fixtures, and separate approvals remain required; no cloud/IaC/scaffold/identity/deploy/spend is authorized."
  }],
  sourceHashes
};
fs.writeFileSync(path.join(root, "evidence.json"), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
console.log("Created initial immutable learning\\S030\\evidence.json; ordinary verification never refreshes proof.");
