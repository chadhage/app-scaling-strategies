'use strict';

// Test tooling, not production code: the TAP reporter of the REDs that the fourth fix archives. It is node:test's own `tap` reporter, byte for byte, except
// that every absolute path of the machine the run was made on is replaced before it reaches the transcript: the repository root by <REPO>, the home folder
// by <HOME> and the user name by <USER> (controller rule 15: the repository is public, and a failing assertion prints the absolute path of the test file in
// its location and stack lines, so an ordinary RED transcript carries the local Windows user name). The replacement is derived from the running process, so
// this file names nothing of the machine. Usage (from the repository root, as the recorder runs it):
//   node --test --test-reporter=./capability/C017/tests/fixtures/sanitized-tap.cjs <test files>
const os = require('node:os');
const path = require('node:path');
const { tap } = require('node:test/reporters');

const repo = path.resolve(__dirname, '..', '..', '..', '..');
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Every spelling the output uses: single and doubled backslashes (YAML and JSON quoting), forward slashes (file: URLs), any letter case.
const spellings = (folder) => [...new Set([folder, folder.replaceAll('\\', '\\\\'), folder.replaceAll('\\', '/')])].sort((a, b) => b.length - a.length);
const rules = [
  ...spellings(repo).map((spelling) => [new RegExp(escape(spelling), 'gi'), '<REPO>']),
  ...spellings(os.homedir()).map((spelling) => [new RegExp(escape(spelling), 'gi'), '<HOME>']),
  [new RegExp(escape(os.userInfo().username), 'gi'), '<USER>'],
];

function clean(text) {
  return rules.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

async function* sanitized(source) {
  for await (const chunk of tap(source)) yield clean(String(chunk));
}

module.exports = sanitized;
module.exports.clean = clean;
