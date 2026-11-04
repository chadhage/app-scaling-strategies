'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { requireCurrentConsent } = require('..\\..\\C015\\consent.cjs');
const { resolveNamespace, assertSafePath } = require('..\\..\\C015\\paths.cjs');

function child(file, args) {
  const result = spawnSync(process.execPath, [file, ...args], {
    encoding: 'utf8', timeout: 90000, maxBuffer: 262144, windowsHide: true,
  });
  if (result.error) throw result.error;
  const text = (result.stdout || result.stderr).trim();
  return {
    exitCode: result.status, stdout: result.stdout, stderr: result.stderr,
    value: text ? JSON.parse(text.split(/\r?\n/).at(-1)) : null,
  };
}

function newFixture() {
  const namespace = `test-${randomUUID()}`;
  const location = resolveNamespace(namespace);
  if (fs.existsSync(location.root)) throw new Error('Unique fixture must be previously absent.');
  const files = new Map();
  const directories = new Map();
  const observations = [];
  const removed = [];

  function track(runId) {
    if (!['synthetic-run-001', 'synthetic-run-002'].includes(runId)) return;
    const run = path.join(location.root, runId);
    for (const directory of [location.root, run]) {
      if (!fs.existsSync(directory)) continue;
      const stat = assertSafePath(location, directory, 'directory');
      if (!directories.has(directory)) directories.set(directory, { ino: stat.ino, dev: stat.dev });
    }
    const candidates = [path.join(location.root, 'writer.lock')];
    for (const suffix of ['001', '002', '003']) {
      candidates.push(path.join(run, `epoch-${suffix}.json`), path.join(run, `pending-${suffix}.json`));
    }
    for (const target of candidates) {
      if (!fs.existsSync(target)) continue;
      const stat = assertSafePath(location, target, 'file');
      if (!files.has(target)) files.set(target, { ino: stat.ino, dev: stat.dev });
    }
  }

  return {
    namespace, location, observations, removed,
    write(runId, epoch, fault) {
      const args = [namespace, runId, String(epoch)];
      if (fault !== undefined) args.push(fault);
      let observed;
      try {
        observed = child(path.join(__dirname, 'fixture-worker.cjs'), args);
        observations.push({ operation: 'C015-public-persist-setup-only', runId, epoch, fault, ...observed });
        return observed;
      } finally {
        track(runId);
      }
    },
    read(runId) {
      const observed = child(path.resolve(__dirname, '..', 'fresh-reader.cjs'), [namespace, runId]);
      observations.push({ operation: 'fresh-C018-reader', runId, ...observed });
      return observed;
    },
    async cleanup() {
      for (const [target, identity] of files) {
        if (!fs.existsSync(target)) continue;
        await requireCurrentConsent();
        const stat = assertSafePath(location, target, 'file');
        if (stat.ino !== identity.ino || stat.dev !== identity.dev) throw new Error('Tracked file identity changed; cleanup refuses.');
        fs.unlinkSync(target);
        removed.push(path.relative(location.root, target));
      }
      for (const [directory, identity] of [...directories].sort((a, b) => b[0].length - a[0].length)) {
        if (directory === location.base || !fs.existsSync(directory)) continue;
        await requireCurrentConsent();
        const stat = assertSafePath(location, directory, 'directory');
        if (stat.ino !== identity.ino || stat.dev !== identity.dev) throw new Error('Tracked directory identity changed; cleanup refuses.');
        fs.rmdirSync(directory);
        removed.push(path.relative(location.root, directory) || '(owned UUID directory)');
      }
      if (fs.existsSync(location.root)) throw new Error('Explicit owned UUID cleanup is incomplete.');
    },
  };
}

module.exports = Object.freeze({ newFixture, child });
