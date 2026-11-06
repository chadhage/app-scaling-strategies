'use strict';

// Test tooling, not production code: runs ONE L-0004 command per enumerated production file (four at a time) and
// enforces 85 lines, 85 branches and 85 functions for each file on its own row. Each command's raw output is kept when
// C028_COVERAGE_OUT names a directory (the recorder uses it); the summary is printed either way.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const gate = require('./coverage-gate.cjs');

const repository = path.resolve(__dirname, '..', '..', '..');
const PARALLEL = 4;
const TIMEOUT_MS = 600000;

function measure(file) {
  return new Promise((resolve) => {
    const args = gate.commandFor(file);
    const child = spawn(process.execPath, args, { cwd: repository, env: gate.nestedEnvironment(process.env), windowsHide: true });
    const chunks = [];
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.once('close', (exitCode) => {
      clearTimeout(timer);
      const text = Buffer.concat(chunks).toString('utf8');
      resolve({ file, exitCode, text, args, result: gate.evaluate(file, gate.parse(text)) });
    });
  });
}

async function main() {
  const files = gate.enumerate();
  const outcomes = [];
  const queue = [...files];
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (queue.length > 0) outcomes.push(await measure(queue.shift()));
  }));
  outcomes.sort((a, b) => a.file.localeCompare(b.file));
  if (process.env.C028_COVERAGE_OUT) {
    fs.mkdirSync(process.env.C028_COVERAGE_OUT, { recursive: true });
    for (const outcome of outcomes) {
      fs.writeFileSync(path.join(process.env.C028_COVERAGE_OUT, `${outcome.file}.out.txt.gz`), zlib.gzipSync(outcome.text), { flag: 'wx' });
      fs.writeFileSync(path.join(process.env.C028_COVERAGE_OUT, `${outcome.file}.command.json`), `${JSON.stringify({ file: outcome.file, command: ['node', ...outcome.args], exitCode: outcome.exitCode, result: outcome.result }, null, 2)}\n`, { flag: 'wx' });
    }
  }
  const results = outcomes.map((outcome) => outcome.result);
  process.stdout.write(gate.format(results, gate.unmeasured()));
  const weak = outcomes.filter((outcome) => outcome.result.failures.length > 0 || outcome.exitCode !== 0);
  if (weak.length > 0) {
    console.error(`C028 coverage RED: ${weak.map((outcome) => `${outcome.file} (exit ${outcome.exitCode})`).join(', ')} below 85/85/85 or failing (unloaded counts as 0%).`);
    process.exitCode = 1;
  } else {
    console.log(`C028 coverage GREEN: ${files.length}/${files.length} enumerated production files at or above 85 lines, 85 branches and 85 functions each: ${files.join(', ')}.`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
