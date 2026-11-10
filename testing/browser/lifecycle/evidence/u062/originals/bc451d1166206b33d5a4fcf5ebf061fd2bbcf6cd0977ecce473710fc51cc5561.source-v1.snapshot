'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function openLookAlike(relativePath, options) {
  const world = options.legacyWorld;
  const kind = process.env.U062_LEGACY_KIND;
  assert.ok(kind === 'u005' || kind === 'u006');
  const name = kind === 'u005' ? 'u005-real.test.cjs' : 'u006-support-real.cjs';
  const source = fs.readFileSync(path.join(__dirname, 'retained-subjects', `${name}.original`), 'utf8');
  const module = { exports: {} };
  const fakeFs = { existsSync: () => true, promises: { rm: async (profile) => { world.removedProfiles.push(profile); } } };
  const requireFixture = (id) => {
    if (id === 'node:test') return () => {};
    if (id === 'node:fs') return fakeFs;
    if (id === 'node:child_process') return { spawn: () => world.legacySpawn(), execFileSync: () => { throw new Error('an OS probe is not part of this retained-fixture unit run'); } };
    if (id === './support/process-table.cjs') return { readProcessTable: () => world.legacyTable(), isAlive: (pid) => world.rows.has(pid) };
    if (id === '../owned.cjs') return { createOwnedAdapters: () => world.adapters, systemClock: world.clock };
    if (id === '../startup.cjs') return { StartupError: class StartupError extends Error {}, openLessonBounded: () => { throw new Error('the bounded startup subject must not be a fixture oracle'); } };
    if (id === '../../qualify/adapters.cjs') return { readQualified: () => ({ qualifiedMajors: [156, 157] }) };
    if (id.startsWith('node:')) return require(id);
    throw new Error(`unexpected retained fixture dependency ${id}`);
  };
  let suffix = '\nmodule.exports = { startLookAlike, stopLookAlike };\n';
  if (kind === 'u005') {
    const cleanup = /    lookAlike\.kill\(\);[\s\S]*?await fs\.promises\.rm\(profile, \{ recursive: true, force: true, maxRetries: 10, retryDelay: 500 \}\)\.catch\(\(\) => \{\}\);/.exec(source);
    assert.ok(cleanup, 'retain the original U005 cleanup body byte-for-byte, not a substitute bug');
    suffix = `\nasync function stopLookAlike(lookAlike, profile) {\n${cleanup[0]}\n}\nmodule.exports = { startLookAlike, stopLookAlike };\n`;
  }
  const FakeDate = class extends Date { static now() { return world.time; } };
  const context = {
    module, exports: module.exports, require: requireFixture,
    __dirname: path.join(__dirname, 'retained-subjects'), __filename: name,
    process: { env: {}, pid: 1 }, console, Buffer, Date: FakeDate,
    setTimeout: (fn, ms) => { world.time += ms; fn(); return 1; }, clearTimeout: () => {},
  };
  vm.runInNewContext(source + suffix, context, { filename: `${name}.retained`, timeout: 10000 });
  const child = await module.exports.startLookAlike('caller-owned-fake-profile');
  return {
    pid: child.pid,
    identity: { pid: child.pid, createdAt: '200' },
    isAlive: async () => world.rows.has(child.pid),
    close: () => module.exports.stopLookAlike(child, 'caller-owned-fake-profile'),
  };
}

module.exports = { openLookAlike };
