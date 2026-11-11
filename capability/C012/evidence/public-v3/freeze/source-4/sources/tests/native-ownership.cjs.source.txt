'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createOwnedAdapters } = require('../../../testing/browser/lifecycle/owned.cjs');
const { append } = require('./journal.cjs');
const { spawnSync } = require('node:child_process');
const { remaining } = require('./budget.cjs');
const storage = new AsyncLocalStorage(), created = [];
const runtime = path.resolve(__dirname, '..', '..', '..', '.git', 'kanban-orchestrator', 'browser-runtime');
function identity(file) {
  const stat = fs.lstatSync(file, { bigint: true });
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
}
const same = (left, right) => left.pid === right.pid && left.createdAt === right.createdAt;
function observe() {
  const original = fs.mkdtemp, promised = fs.promises.mkdtemp;
  const remember = (label, file) => {
    const relative = path.relative(runtime, file);
    if (!label || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return;
    created.push({ label, path: file, identity: identity(file), authority: 'successful exclusive mkdtemp in this bounded invocation' });
  };
  fs.mkdtemp = function (...args) {
    const label = storage.getStore(), callback = args.at(-1);
    if (typeof callback !== 'function') return original.apply(this, args);
    args[args.length - 1] = function (error, file) { if (!error) remember(label, file); return callback.apply(this, arguments); };
    return original.apply(this, args);
  };
  fs.promises.mkdtemp = async function (...args) {
    const label = storage.getStore(), file = await promised.apply(this, args); remember(label, file); return file;
  };
  return () => { fs.mkdtemp = original; fs.promises.mkdtemp = promised; };
}
async function authenticate(session, label) {
  const adapters = createOwnedAdapters();
  const protocol = await session.page.context().browser().newBrowserCDPSession();
  try {
    const roots = (await protocol.send('SystemInfo.getProcessInfo')).processInfo.filter(row => row.type === 'browser');
    assert.equal(roots.length, 1, 'one independently authenticated actual browser root');
    const table = await adapters.list({ timeoutMs: 60000 });
    const root = table.find(row => row.pid === roots[0].id);
    assert.ok(root && typeof root.createdAt === 'string');
    const recorded = session.owned.recorded();
    assert.ok(recorded.some(row => same(row, root)));
    assert.ok(session.owned.roots.length >= 1);
    const directories = created.filter(row => row.label === label);
    assert.equal(directories.length, 2, 'opaque profile and artifacts directory positively created by this invocation');
    const shell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = `$ErrorActionPreference='Stop';Get-CimInstance Win32_Process -Filter 'ProcessId=${root.pid}' -Property ProcessId,CommandLine|Select-Object ProcessId,CommandLine|ConvertTo-Json -Compress`;
    const native = spawnSync(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      windowsHide: true, timeout: Math.min(remaining(), 60000),
      env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'psmodulepath'))
    });
    assert.equal(native.error, undefined); assert.equal(native.status, 0, String(native.stderr));
    const binding = JSON.parse(native.stdout.toString('utf8'));
    assert.equal(binding.ProcessId, root.pid);
    const profiles = directories.filter(directory => {
      const plain = '--user-data-dir=' + directory.path;
      return binding.CommandLine.includes(plain + ' ') || binding.CommandLine.endsWith(plain) || binding.CommandLine.includes('--user-data-dir="' + directory.path + '"');
    });
    assert.equal(profiles.length, 1, 'exactly one exclusive directory is bound to the authenticated native browser root profile');
    append(root, 'authenticated-browser-root-before-UI-campaign:' + label);
    for (const item of recorded) append(item, 'owned-browser-lifecycle-before-UI-campaign:' + label);
    const second = await adapters.list({ timeoutMs: 60000 });
    assert.ok(second.some(row => same(row, root)), 'root native creation identity is confirmed twice');
    return { label, root: { pid: root.pid, createdAt: root.createdAt }, recorded, profiles, directories, scratch: session.scratchPaths(), adapters };
  } finally { await protocol.detach(); }
}
async function close(session, authority) {
  const closing = session.close();
  assert.equal(session.close(), closing);
  const result = await closing;
  assert.equal(result.clean, true); assert.equal(result.process.confirmed, true); assert.equal(result.scratch.clean, true);
  const recorded = session.owned.recorded();
  for (const item of recorded) append(item, 'owned-browser-lifecycle-final:' + authority.label);
  const after = await authority.adapters.list({ timeoutMs: 60000 });
  assert.deepEqual(recorded.filter(item => after.some(row => same(row, item))), [], 'all exact recorded owned identities exited');
  for (const directory of authority.scratch) assert.equal(fs.existsSync(directory), false);
  for (const directory of authority.directories) {
    if (fs.existsSync(directory.path)) {
      assert.deepEqual(identity(directory.path), directory.identity, 'replacement directory is never cleanup authority');
      await fs.promises.rm(directory.path, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 });
    }
    assert.equal(fs.existsSync(directory.path), false);
  }
  assert.equal(await session.close(), result);
  return { clean: true, root: authority.root, ownedNativeIdentities: recorded,
    absentScratchCount: authority.scratch.length, absentExclusiveProfileArtifactCount: authority.directories.length };
}
module.exports = { runtime, observe, scope: storage, authenticate, close };
