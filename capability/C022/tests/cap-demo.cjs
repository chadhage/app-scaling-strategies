'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { childEnv } = require('./proc.cjs');
const { sha, lf } = require('./evidence-verify.cjs');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) =>
  value.startsWith('--') ? [...pairs, [value.slice(2), all[i + 1]]] : pairs, []));
const scratch = path.resolve(options.scratch);
const original = fs.readFileSync(path.join(root, 'contract.js'), 'utf8');
assert.equal(original.split('connections: 256').length - 1, 1);
fs.mkdirSync(scratch, { recursive: false });
const rows = [];
try {
  for (const cap of [128, 127]) {
    const tree = path.join(scratch, String(cap));
    const target = path.join(tree, 'capability', 'C022');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(root, target, { recursive: true, filter: (file) => !['evidence', 'scratch'].includes(path.basename(file)) });
    for (const entry of require('../imports.json').dependencies.filter((entry) => entry.path.startsWith('capability/'))) {
      const destination = path.join(tree, entry.path);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(repo, entry.path), destination);
    }
    const changed = original.replace('connections: 256', `connections: ${cap}`);
    fs.writeFileSync(path.join(target, 'contract.js'), changed);
    const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=60000',
      path.join('capability', 'C022', 'tests', 'pipeline-process-third-hole.test.cjs')], {
      cwd: tree, env: childEnv({ C022_SUBJECT_DIR: target }), encoding: 'utf8', timeout: 180000, maxBuffer: 1 << 25
    });
    process.stdout.write(run.stdout || '');
    process.stderr.write(run.stderr || '');
    const text = `${run.stdout || ''}${run.stderr || ''}`;
    const failures = [...text.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1].trim());
    assert.equal(run.error, undefined, 'a command timeout is not a classified cap result');
    if (cap === 128) {
      assert.equal(run.status, 0);
      assert.equal(failures.length, 0);
      assert.match(text, /^# pass 7$/m);
    } else {
      assert.equal(run.status, 1);
      assert.ok(failures.some((name) => name.startsWith('128 sockets that each send [G][G][X]')));
      assert.match(text, /ERR_ASSERTION/);
    }
    rows.push({ cap, exit: run.status, failures, contractLfSha256: sha(lf(Buffer.from(changed))) });
  }
  const document = { schema: 'C022-lowest-burst-cap/1', shippedCapUnchanged: 256, sourceLfSha256: sha(lf(Buffer.from(original))),
    lowestBurstCap: 128, controlCap: 127, observations: rows, pendingSocketMbApproximate: 6,
    lowerCapGiBExtrapolation: 128 * 6 / 1024, extrapolationNotMeasurement: true };
  fs.writeFileSync(path.resolve(options.out), `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx' });
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
