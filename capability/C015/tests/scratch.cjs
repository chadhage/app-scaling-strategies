'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { requireCurrentConsent } = require('..\\consent.cjs');
const { resolveNamespace, assertSafePath, within } = require('..\\paths.cjs');

class Scratch {
  constructor() {
    this.namespace = `test-${randomUUID()}`;
    this.location = resolveNamespace(this.namespace);
    this.files = new Map();
    this.directories = new Set();
    this.processes = [];
  }

  target(relative) {
    if (typeof relative !== 'string' || path.isAbsolute(relative) || /[:\0]/.test(relative)) throw new Error('Invalid explicit scratch target.');
    const target = path.resolve(this.location.root, relative);
    if (target === this.location.root || !within(this.location.root, target)) throw new Error('No scratch root, traversal or unowned target.');
    return target;
  }

  trackChild(runId) {
    if (!['synthetic-run-001', 'synthetic-run-002'].includes(runId)) return;
    const root = this.location.root;
    const run = path.join(root, runId);
    for (const directory of [root, run]) {
      if (fs.existsSync(directory)) this.directories.add(directory);
    }
    const names = [path.join(root, 'writer.lock')];
    for (const epoch of ['001', '002', '003']) {
      names.push(path.join(run, `epoch-${epoch}.json`), path.join(run, `pending-${epoch}.json`));
    }
    for (const target of names) {
      try {
        const stat = fs.lstatSync(target);
        if (stat.isFile() && !this.files.has(target)) this.files.set(target, 'file');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }

  child(action, runId = 'synthetic-run-001', epoch, fault) {
    const args = [action, this.namespace, runId];
    if (epoch !== undefined) args.push(String(epoch));
    if (fault !== undefined) args.push(fault);
    const result = spawnSync(process.execPath, [path.join(__dirname, 'worker.cjs'), ...args], {
      encoding: 'utf8', timeout: 90000, maxBuffer: 65536, windowsHide: true,
    });
    this.trackChild(runId);
    if (result.error) throw result.error;
    const lines = (result.status === 0 ? result.stdout : result.stderr).trim().split(/\r?\n/);
    const value = lines.at(-1) ? JSON.parse(lines.at(-1)) : null;
    const observed = { action, runId, epoch, fault, exitCode: result.status, stdout: result.stdout, stderr: result.stderr, value };
    this.processes.push(observed);
    return observed;
  }

  async mkdir(relative) {
    const target = relative ? this.target(relative) : this.location.root;
    for (const directory of [this.location.base, this.location.root, target]) {
      if (!assertSafePath(this.location, directory, 'directory')) {
        await requireCurrentConsent();
        assertSafePath(this.location, directory);
        fs.mkdirSync(directory);
        if (directory !== this.location.base) this.directories.add(directory);
      }
    }
    return target;
  }

  async writeBytes(relative, bytes) {
    const target = this.target(relative);
    await requireCurrentConsent();
    assertSafePath(this.location, target, 'file');
    fs.writeFileSync(target, bytes);
    this.files.set(target, 'file');
    return target;
  }

  async unlink(relative) {
    const target = this.target(relative);
    if (!this.files.has(target)) throw new Error('Only an explicitly created scratch file may be removed.');
    await requireCurrentConsent();
    assertSafePath(this.location, target, 'file');
    fs.unlinkSync(target);
    this.files.delete(target);
  }

  async hardlink(sourceRelative, targetRelative) {
    const source = this.target(sourceRelative);
    const target = this.target(targetRelative);
    await requireCurrentConsent();
    assertSafePath(this.location, source, 'file');
    assertSafePath(this.location, target);
    fs.linkSync(source, target);
    this.files.set(source, 'hardlinked-file');
    this.files.set(target, 'hardlinked-file');
  }

  async junction(targetRelative, linkRelative) {
    const target = this.target(targetRelative);
    const link = this.target(linkRelative);
    await requireCurrentConsent();
    assertSafePath(this.location, target, 'directory');
    assertSafePath(this.location, link);
    fs.symlinkSync(target, link, 'junction');
    this.files.set(link, 'junction');
    return link;
  }

  async cleanup() {
    for (const [target, kind] of this.files) {
      if (!within(this.location.root, target) || target === this.location.root) throw new Error('Cleanup target is not an explicit owned child.');
      let stat;
      try { stat = fs.lstatSync(target); } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      await requireCurrentConsent();
      if (kind === 'junction') {
        if (!stat.isSymbolicLink()) throw new Error('Recorded junction changed; do not clean an unowned target.');
        fs.unlinkSync(target);
      } else {
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Recorded file changed; cleanup will not follow links.');
        if (kind !== 'hardlinked-file') assertSafePath(this.location, target, 'file');
        else assertSafePath(this.location, path.dirname(target), 'directory');
        fs.unlinkSync(target);
      }
    }
    for (const directory of [...this.directories].sort((a, b) => b.length - a.length)) {
      if (directory === this.location.base || !within(this.location.root, directory)) throw new Error('Never clean a fixture category root.');
      if (!fs.existsSync(directory)) continue;
      await requireCurrentConsent();
      assertSafePath(this.location, directory, 'directory');
      fs.rmdirSync(directory);
    }
    this.files.clear();
    this.directories.clear();
  }
}

module.exports = Object.freeze({ newScratch: () => new Scratch() });
