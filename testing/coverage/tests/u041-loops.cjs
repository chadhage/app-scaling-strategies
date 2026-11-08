'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildEnvironment } = require('../command.cjs');
const { killTree } = require('../runner.cjs');
const { sha } = require('./u041-authority.cjs');

const namespace = path.resolve(__dirname, '..');
const files = Object.freeze(['u041-json.test.cjs', 'u041-fast-json.test.cjs', 'u041-real-work.test.cjs']);

async function loops(outDir, { requested = 64, parallel = 8 } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: parallel }, async () => {
    while (next < requested) {
      const number = ++next;
      const args = ['--test', '--test-concurrency=1', ...files.map((file) => path.join(__dirname, file))];
      const child = spawn(process.execPath, args, {
        cwd: path.resolve(namespace, '..', '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: buildEnvironment(process.env, { U041_SUBJECT_ROOT: undefined, U009_EVIDENCE_CAPTURE: undefined, U009_HEAVY_HERMETIC: undefined })
      });
      const stdout = [];
      const stderr = [];
      try {
        const ended = await new Promise((resolve) => {
          child.stdout.on('data', (bytes) => stdout.push(bytes));
          child.stderr.on('data', (bytes) => stderr.push(bytes));
          child.once('error', (error) => stderr.push(Buffer.from(error.message)));
          child.once('close', (exit, signal) => resolve({ exit, signal }));
        });
        const out = Buffer.concat(stdout);
        const err = Buffer.concat(stderr);
        const text = out.toString('utf8');
        const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map((key) =>
          [key, Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text)?.[1])]));
        const ok = ended.exit === 0 && ended.signal === null && counts.tests === 7 && counts.pass === 7 &&
          counts.fail === 0 && counts.cancelled === 0 && counts.skipped === 0 && counts.todo === 0;
        fs.writeFileSync(path.join(outDir, `${number}.stdout.raw`), out, { flag: 'wx' });
        fs.writeFileSync(path.join(outDir, `${number}.stderr.raw`), err, { flag: 'wx' });
        const result = { number, pid: child.pid, ...ended, ...counts, ok, stdoutSha256: sha(out), stderrSha256: sha(err), timeoutUsed: false };
        results.push(result);
        fs.appendFileSync(path.join(outDir, 'progress.jsonl'), JSON.stringify(result) + '\n');
      } finally {
        if (child.exitCode === null && child.signalCode === null && child.pid) killTree(child.pid);
      }
    }
  }));
  results.sort((a, b) => a.number - b.number);
  const document = { schema: 'U041-loop/1', files, requested, completed: results.length, parallel, burners: 0,
    testConcurrency: 1, failed: results.filter((entry) => !entry.ok).length, timeoutUsed: false, results };
  fs.writeFileSync(path.join(outDir, 'loops.json'), JSON.stringify(document, null, 2) + '\n', { flag: 'wx' });
  return document;
}

if (require.main === module) {
  if (!process.argv[2]) throw new Error('Usage: node testing\\coverage\\tests\\u041-loops.cjs <owned-output-dir>');
  loops(path.resolve(process.argv[2])).then((document) => { console.log(JSON.stringify(document)); process.exitCode = document.failed ? 1 : 0; })
    .catch((error) => { console.error(error.stack); process.exitCode = 2; });
}

module.exports = Object.freeze({ files, loops });
