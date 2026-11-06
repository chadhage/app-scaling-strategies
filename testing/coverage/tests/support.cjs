'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repository = path.resolve(__dirname, '..', '..', '..');
const gatePath = path.join(__dirname, '..', 'gate.cjs');
const fixtureRoot = (name) => path.join(__dirname, '..', 'fixtures', name);
const scratchBase = path.join(__dirname, '..', '.scratch', 'work');

// Hermetic scratch folders live below the namespace (never in the system temp folder) and are removed by dispose(), which also removes the
// empty base folders again. Another test process may remove an empty base between the two calls, so a missing base is created again.
function makeScratch(label) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      fs.mkdirSync(scratchBase, { recursive: true });
      return fs.mkdtempSync(path.join(scratchBase, `${label}-`));
    } catch (error) {
      if (error.code !== 'ENOENT' || attempt >= 3) throw error;
    }
  }
}

function dispose(directory) {
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  for (const folder of [scratchBase, path.dirname(scratchBase)]) {
    try {
      fs.rmdirSync(folder);
    } catch {
      return;
    }
  }
}

function writeTree(root, files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

// A fake per-file runner for in-process tests: it answers with canned TAP text and writes the canned lcov to the destination in the arguments.
function fakeRunner(handler) {
  const calls = [];
  const run = async (options) => {
    const lcovArgument = options.args.filter((argument) => argument.startsWith('--test-reporter-destination=')).pop();
    const lcovPath = lcovArgument.slice('--test-reporter-destination='.length);
    const include = options.args.find((argument) => argument.startsWith('--test-coverage-include=')).slice('--test-coverage-include='.length);
    calls.push({ options, include, lcovPath });
    const answer = await handler({ include, lcovPath, options });
    if (answer.lcov !== undefined) fs.writeFileSync(lcovPath, answer.lcov);
    return { status: 0, signal: null, spawnError: null, timedOut: false, stdout: '', stderr: '', truncated: false, ...answer.run };
  };
  run.calls = calls;
  return run;
}

const tapSummary = (counts = {}) => {
  const { tests = 1, pass = 1, fail = 0, cancelled = 0 } = counts;
  return `TAP version 13\n1..${tests}\n# tests ${tests}\n# suites 0\n# pass ${pass}\n# fail ${fail}\n# cancelled ${cancelled}\n# skipped 0\n# todo 0\n# duration_ms 5\n`;
};

const lcovRecord = (file, { lines = [10, 10], branches = [2, 2], functions = [1, 1] } = {}) =>
  `TN:\nSF:${file}\nFNF:${functions[1]}\nFNH:${functions[0]}\nBRF:${branches[1]}\nBRH:${branches[0]}\nDA:1,1\nLH:${lines[0]}\nLF:${lines[1]}\nend_of_record\n`;

module.exports = Object.freeze({
  repository, gatePath, fixtureRoot, scratchBase, makeScratch, dispose, writeTree, fakeRunner, tapSummary, lcovRecord
});
