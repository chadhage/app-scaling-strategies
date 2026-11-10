'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { spawnSync } = require('node:child_process');
const repository = path.resolve(__dirname, '..', '..', '..');
const runtime = path.join(repository, '.git', 'kanban-orchestrator', 'browser-runtime');
const { createOwnedAdapters } = require('../../../testing/browser/lifecycle/owned.cjs');
const scope = new AsyncLocalStorage();
const creations = [];
const identity = (file) => {
  const stat = fs.lstatSync(file, { bigint: true });
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
};
const same = (left, right) => left.pid === right.pid && left.createdAt === right.createdAt;

function observe() {
  const original = fs.mkdtemp;
  const promised = fs.promises.mkdtemp;
  const record = (label, file) => {
    const relative = path.relative(runtime, file);
    if (!label || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return;
    creations.push({ label, path: file, identity: identity(file), authority: 'successful exclusive mkdtemp in this invocation' });
  };
  fs.mkdtemp = function (...args) {
    const label = scope.getStore();
    const callback = args.at(-1);
    if (typeof callback !== 'function') return original.apply(this, args);
    args[args.length - 1] = function (error, file) {
      if (!error) record(label, file);
      return callback.apply(this, arguments);
    };
    return original.apply(this, args);
  };
  fs.promises.mkdtemp = async function (...args) {
    const label = scope.getStore();
    const file = await promised.apply(this, args);
    record(label, file);
    return file;
  };
  return () => { fs.mkdtemp = original; fs.promises.mkdtemp = promised; };
}

async function authenticate(session, label) {
  const adapters = createOwnedAdapters();
  const browser = session.page.context().browser();
  const protocol = await browser.newBrowserCDPSession();
  try {
    const roots = (await protocol.send('SystemInfo.getProcessInfo')).processInfo.filter((entry) => entry.type === 'browser');
    assert.equal(roots.length, 1, 'one authenticated browser root');
    const table = await adapters.list({ timeoutMs: 60000 });
    const root = table.find((entry) => entry.pid === roots[0].id);
    assert.ok(root && /^\d+$/.test(root.createdAt), 'authenticated root has a native creation identity');
    const recorded = session.owned.recorded();
    assert.ok(recorded.some((entry) => same(entry, root)), 'native root belongs to this bounded helper invocation');
    assert.ok(session.owned.roots.length >= 1, 'recorded root lower bound is nonzero');
    const createdDirectories = creations.filter((entry) => entry.label === label);
    assert.equal(createdDirectories.length, 2, 'the cached helper creates its opaque profile and artifacts directory exclusively');
    const shell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = `$ErrorActionPreference='Stop';Get-CimInstance Win32_Process -Filter 'ProcessId=${root.pid}' -Property ProcessId,CommandLine | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`;
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'psmodulepath'));
    const native = spawnSync(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      env, windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024
    });
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, String(native.stderr));
    const binding = JSON.parse(native.stdout.toString('utf8'));
    assert.equal(binding.ProcessId, root.pid);
    const profiles = createdDirectories.filter((entry) => {
      const plain = '--user-data-dir=' + entry.path;
      return binding.CommandLine.includes(plain + ' ') || binding.CommandLine.endsWith(plain)
        || binding.CommandLine.includes('--user-data-dir="' + entry.path + '"');
    });
    assert.equal(profiles.length, 1, 'exactly one positively created directory is authenticated as the native root profile');
    const profile = profiles[0];
    assert.deepEqual(identity(profile.path), profile.identity);
    const second = await adapters.list({ timeoutMs: 60000 });
    assert.ok(second.some((entry) => same(entry, root)), 'native creation identity remains unchanged');
    return { label, root: { pid: root.pid, createdAt: root.createdAt }, recorded, profiles, createdDirectories, scratch: session.scratchPaths(), adapters };
  } finally { await protocol.detach(); }
}

async function closeOwned(session, authority) {
  const closing = session.close();
  assert.equal(session.close(), closing, 'repeated close shares its original bounded lifecycle');
  const outcome = await closing;
  assert.equal(outcome.clean, true);
  assert.equal(outcome.process.confirmed, true);
  assert.equal(outcome.scratch.clean, true);
  const recorded = session.owned.recorded();
  assert.ok(authority.recorded.every((entry) => recorded.some((row) => same(entry, row))), 'the final ownership record retains the observed roots and children');
  const after = await authority.adapters.list({ timeoutMs: 60000 });
  assert.deepEqual(recorded.filter((entry) => after.some((row) => same(entry, row))), [], 'all observed owned native identities, including late children, exited');
  for (const directory of authority.scratch) assert.equal(fs.existsSync(directory), false, 'the owned helper scratch is absent');
  for (const profile of authority.createdDirectories) {
    if (fs.existsSync(profile.path)) {
      assert.deepEqual(identity(profile.path), profile.identity, 'never delete a replacement profile');
      await fs.promises.rm(profile.path, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 });
    }
    assert.equal(fs.existsSync(profile.path), false, 'only a positively created profile is removed');
  }
  assert.equal(await session.close(), outcome);
  return { clean: true, root: authority.root, ownedNativeIdentities: recorded,
    absentScratchCount: authority.scratch.length, absentProfileCount: authority.profiles.length,
    absentCreatedDirectoryCount: authority.createdDirectories.length };
}

module.exports = { observe, scope, authenticate, closeOwned };
