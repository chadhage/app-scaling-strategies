"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
function scan(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "evidence") return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? scan(file) : /\.(?:js|cjs)$/.test(entry.name) ? [file] : [];
  });
}
for (const file of scan(root)) {
  test(`syntax ${path.relative(root, file)}`, () => {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  });
}
