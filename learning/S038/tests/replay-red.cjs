"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");

function replay() {
  const script = `
    const fs = require("node:fs");
    const vm = require("node:vm");
    const path = require("node:path");
    const root = ${JSON.stringify(root)};
    const stub = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, "evidence", "red", "authorization.source.snapshot"), "utf8"), { module: stub });
    const archived = fs.readFileSync(path.join(root, "evidence", "red", "assertion.source.snapshot"), "utf8");
    const use = (id) => id === "../authorization.js" ? stub.exports : require(id);
    new Function("require", archived)(use);
  `;
  const child = spawnSync(process.execPath, ["-e", script], { cwd: root, encoding: "utf8", timeout: 15000 });
  assert.equal(child.status, 1, child.stderr || child.stdout);
  assert.match(child.stdout, /ERR_ASSERTION/);
  assert.match(child.stdout, /attempted: 0/);
  assert.match(child.stdout, /attempted: 16/);
  assert.doesNotMatch(`${child.stdout}${child.stderr}`, /MODULE_NOT_FOUND|SyntaxError|ReferenceError/);
  return child;
}
if (require.main === module) {
  const child = replay();
  process.stdout.write(child.stdout);
  process.stderr.write(child.stderr);
  console.log("Archived behavioral RED reproduced; expected assertion failure, not missing code or tools.");
}
module.exports = { replay };
