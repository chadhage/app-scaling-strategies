'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const [mode, ...extra] = process.argv.slice(2);
if (extra.length || !['red', 'input-red', 'input-green', 'focused', 'syntax', 'journeys', 'browser-check'].includes(mode)) throw new Error('Unknown explicit capture mode.');
const id = `${mode}-${randomUUID()}`;
const evidence = path.join(root, 'evidence');
if (!fs.existsSync(evidence)) fs.mkdirSync(evidence);
const entry = (file, bytes) => ({
  file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
});
function save(suffix, bytes) {
  const file = `${id}.${suffix}`;
  fs.writeFileSync(path.join(evidence, file), bytes, { flag: 'wx' });
  return entry(file, bytes);
}
const sourceSnapshots = ['red', 'input-red'].includes(mode) ? ['commands.cjs', path.join('tests', 'conditional.test.cjs')].map((file, index) =>
  save(`${index}.snapshot`, fs.readFileSync(path.join(root, file)))) : [];
const args = mode === 'red'
  ? ['--test', path.join(__dirname, 'conditional.test.cjs')]
  : ['input-red', 'input-green'].includes(mode)
    ? ['--test', '--test-name-pattern', '^command input snapshot', path.join(__dirname, 'conditional.test.cjs')]
  : mode === 'journeys' ? [path.join(root, 'cli.cjs'), 'conduct', 'all']
    : [path.join(__dirname, 'verify.cjs'), mode === 'browser-check' ? 'browser' : mode];
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
const result = spawnSync(process.execPath, args, {
  cwd: path.resolve(root, '..', '..'), timeout: 900000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, env,
});
if (result.error) throw result.error;
const report = {
  schemaVersion: 1, cardId: 'C016', kind: mode, capturedAtUtc: new Date().toISOString(),
  command: [process.execPath, ...args], exitCode: result.status,
  stdout: save('stdout.raw', result.stdout), stderr: save('stderr.raw', result.stderr), sourceSnapshots,
  captureByNormalVerifier: false, originalUnitCredits: 0,
};
const raw = Buffer.from(`${JSON.stringify(report, null, 2).replace(/\n/g, '\r\n')}\r\n`);
const record = save('raw.json', raw);
console.log(JSON.stringify({ ...record, exitCode: result.status }));
if (['red', 'input-red'].includes(mode)) {
  const assertion = mode === 'red' ? 'A fresh submit must actually publish' : 'A pending command must keep its declared input identity';
  if (result.status !== 1 || !result.stdout.toString('utf8').includes(assertion) ||
      /MODULE_NOT_FOUND|Cannot find module/.test(result.stdout.toString('utf8'))) {
    throw new Error('RED must be a genuine loadable-stub behavior assertion failure.');
  }
} else {
  process.exitCode = result.status === 0 ? 0 : 1;
}
