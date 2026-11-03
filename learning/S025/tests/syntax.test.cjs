"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("all owned runnable JavaScript parses, excluding inert evidence snapshots", () => {
  const root = path.resolve(__dirname, "..");
  const files = [];
  function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "evidence") continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.(js|cjs)$/.test(entry.name)) files.push(file);
    }
  }
  scan(root);
  assert.equal(files.length, 8);
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, `${file}\n${result.stdout}${result.stderr}`);
  }
});
