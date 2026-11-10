'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const args = JSON.parse(process.argv[2]);
if (!Array.isArray(args) || args.some((value) => typeof value !== 'string')) throw new Error('an argument array is required');
const env = { ...process.env };
for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
async function main() {
  const cwd = env.C059_PHYSICAL_CWD === '1' ? await fs.promises.realpath(__dirname) : __dirname;
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
