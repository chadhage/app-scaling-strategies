'use strict';

// Test tooling (not production code): scratch directories next to the tests and a fake "PowerShell".
const fs = require('node:fs');
const path = require('node:path');

// Scratch lives under the tests folder and is removed by the test that made it (never %TEMP%).
function scratchDir() {
  return fs.mkdtempSync(path.join(__dirname, 'scratch-'));
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// A fake shell is node itself running a script, so real processes, pipes, environment and timeouts are exercised.
function fakeShell(code, extra = []) {
  return { shell: process.execPath, buildArgs: () => ['-e', code, ...extra] };
}

// A fake answer of the PowerShell inspection script: base64 of UTF-8 JSON on stdout.
const ECHO_ANSWER = [
  'const env = process.env;',
  "const hasModulePath = Object.keys(env).some((key) => key.toLowerCase() === 'psmodulepath');",
  "const answer = { status: 'Valid', statusMessage: String(process.pid), subject: env.QUALIFY_TARGET,",
  '  issuer: JSON.stringify(process.argv.slice(1)), thumbprint: String(hasModulePath), fileVersion: String(process.pid) };',
  "process.stdout.write(Buffer.from(JSON.stringify(answer), 'utf8').toString('base64') + '\\n');",
].join('\n');

module.exports = { scratchDir, removeDir, fakeShell, ECHO_ANSWER };
