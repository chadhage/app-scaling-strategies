"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("all seven S022 JavaScript sources pass Node22 syntax checks", () => {
  for (const local of [
    "readiness.js", "app.js", "tests\\capture.cjs", "tests\\readiness.test.cjs",
    "tests\\browser.test.cjs", "tests\\integrity.test.cjs", "tests\\syntax.test.cjs"
  ]) {
    const result = spawnSync(process.execPath, ["--check", path.resolve(__dirname, "..", local)],
      { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, `${local}: ${result.stderr || result.error?.message || result.stdout}`);
  }
});
