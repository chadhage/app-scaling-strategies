"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
test("every owned JavaScript source and test parses without emitting files", () => {
  const files = [];
  function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "evidence") continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.(?:js|cjs)$/.test(entry.name)) files.push(file);
    }
  }
  scan(root);
  assert.ok(files.length >= 9);
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { cwd: repo, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, `${file}: ${result.stderr || result.error?.message}`);
  }
});
