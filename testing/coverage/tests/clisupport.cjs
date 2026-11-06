'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { killTree } = require('../runner.cjs');

const repository = path.resolve(__dirname, '..', '..', '..');
const gatePath = path.join(__dirname, '..', 'gate.cjs');

// Runs the real CLI as a child with a hard external timeout; only the tree this call started is ended, by its pid.
// `env` entries replace a variable of any letter case; a value of undefined removes it. The deadline is a hang detector, not a speed limit.
function runGateCli(args, { env = {}, timeout = 240000 } = {}) {
  return new Promise((resolve) => {
    const environment = { ...process.env };
    for (const [name, value] of Object.entries(env)) {
      for (const existing of Object.keys(environment)) {
        if (existing.toUpperCase() === name.toUpperCase()) delete environment[existing];
      }
      if (value !== undefined) environment[name] = value;
    }
    const child = spawn(process.execPath, [gatePath, ...args], { cwd: repository, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    let timedOut = false;
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeout);
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString('utf8');
      let report = null;
      try {
        report = JSON.parse(stdout);
      } catch {
        report = null;
      }
      resolve({ status, signal, timedOut, pid: child.pid, stdout, stderr: Buffer.concat(err).toString('utf8'), report });
    });
  });
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const relativeToRepository = (file) => path.relative(repository, file).replace(/\\/g, '/');

module.exports = Object.freeze({ repository, gatePath, runGateCli, readJson, relativeToRepository });
