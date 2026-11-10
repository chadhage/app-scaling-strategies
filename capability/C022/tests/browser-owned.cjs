'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const repo = path.resolve(__dirname, '..', '..', '..');
const runtime = path.join(repo, '.git', 'kanban-orchestrator', 'browser-runtime');
const { openLoopbackScratchSession } = require(path.join(repo, 'testing', 'browser', 'lifecycle', 'scratch-session.cjs'));
const { createOwnedAdapters } = require(path.join(repo, 'testing', 'browser', 'lifecycle', 'owned.cjs'));
const same = (left, right) => left.pid === right.pid && left.createdAt === right.createdAt;
const identity = (file) => {
  const stat = fs.lstatSync(file, { bigint: true });
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
};
const below = (file) => {
  const rel = path.relative(runtime, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

async function openOwnedLoopback(entry, server) {
  const profiles = new Map();
  const launches = [];
  const errors = [];
  const originalMkdtemp = fs.mkdtemp;
  const originalPromiseMkdtemp = fs.promises.mkdtemp;
  const originalSpawn = childProcess.spawn;
  const remember = (file) => {
    if (below(file)) profiles.set(file, identity(file));
  };
  fs.mkdtemp = function (...args) {
    const callback = args.at(-1);
    if (typeof callback !== 'function') return originalMkdtemp.apply(this, args);
    args[args.length - 1] = function (error, file) {
      if (!error) { try { remember(file); } catch (problem) { errors.push(problem); } }
      return callback.apply(this, arguments);
    };
    return originalMkdtemp.apply(this, args);
  };
  fs.promises.mkdtemp = async function (...args) {
    const file = await originalPromiseMkdtemp.apply(this, args);
    try { remember(file); } catch (problem) { errors.push(problem); }
    return file;
  };
  childProcess.spawn = function (command, args, options) {
    const child = originalSpawn.call(this, command, args, options);
    const profileArgs = (args || []).filter((value) => value.startsWith('--user-data-dir='));
    if (profileArgs.length) launches.push({ launcherPid: child.pid, profile: profileArgs[0].slice('--user-data-dir='.length) });
    return child;
  };
  const adapters = createOwnedAdapters();
  const kills = [];
  const recording = { ...adapters, kill: async (entries, options) => {
    kills.push(...entries.map(({ pid, createdAt }) => ({ pid, createdAt })));
    return adapters.kill(entries, options);
  } };
  let session;
  try {
    session = await openLoopbackScratchSession(entry, server, {
      adapters: recording, deadlineMs: 120000, graceMs: 60000, listMs: 60000, terminateMs: 120000,
      gracefulMs: 60000, settleMs: 60000, exitSettleMs: 45000
    });
  } finally {
    fs.mkdtemp = originalMkdtemp;
    fs.promises.mkdtemp = originalPromiseMkdtemp;
    childProcess.spawn = originalSpawn;
  }
  let owned;
  let launch;
  let closing;
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      const report = await session.close();
      assert.equal(report.clean, true);
      assert.equal(report.process.confirmed, true);
      assert.equal(report.scratch.clean, true);
      const table = await adapters.list({ timeoutMs: 60000 });
      const recorded = session.owned.recorded();
      assert.deepEqual(recorded.filter((entry) => table.some((row) => same(entry, row))), []);
      assert.ok(kills.every((entry) => recorded.some((row) => same(entry, row))), 'only positively recorded identities may be ended');
      assert.ok(session.scratchPaths().every((file) => !fs.existsSync(file)));
      for (const [file, created] of profiles) {
        if (fs.existsSync(file)) {
          assert.deepEqual(identity(file), created, 'never remove a replacement opaque profile');
          for (let attempt = 0; attempt < 4 && fs.existsSync(file); attempt += 1) {
            assert.deepEqual(identity(file), created);
            try { await fs.promises.rm(file, { recursive: true, force: false, maxRetries: 0 }); }
            catch (error) {
              if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code) || attempt === 3) throw error;
              await new Promise((resolve) => setTimeout(resolve, [25, 50, 100][attempt]));
            }
          }
        }
        assert.equal(fs.existsSync(file), false);
      }
      const result = { clean: true, owned, endedRecordedIdentities: recorded.map(({ pid, createdAt }) => ({ pid, createdAt })),
        profilesAbsent: profiles.size, scratchAbsent: session.scratchPaths().length, killRequests: kills,
        unknownNeighborsAdopted: false, globalCleanupClaimed: false };
      console.log(`C022 OWN CLEANUP ${JSON.stringify(result)}`);
      return result;
    })();
    return closing;
  }
  try {
    assert.deepEqual(errors, []);
    assert.equal(launches.length, 1, 'one browser launch was observed inside this open');
    [launch] = launches;
    assert.ok(profiles.has(launch.profile), 'profile was exclusively created by this invocation before launch');
    assert.deepEqual(identity(launch.profile), profiles.get(launch.profile));
    const browser = session.page.context().browser();
    const cdp = await browser.newBrowserCDPSession();
    let browserPid;
    try {
      const info = await cdp.send('SystemInfo.getProcessInfo');
      const roots = info.processInfo.filter((entry) => entry.type === 'browser');
      assert.equal(roots.length, 1);
      browserPid = roots[0].id;
    } finally { await cdp.detach(); }
    const table = await adapters.list({ timeoutMs: 60000 });
    const root = table.find((entry) => entry.pid === browserPid);
    assert.ok(root && /^\d+$/.test(root.createdAt), 'CDP root has a native creation identity');
    assert.ok(session.owned.recorded().some((entry) => same(entry, root)), 'CDP root is in this invocation recorded set');
    assert.ok(session.owned.roots.length >= 1);
    assert.ok(session.owned.roots.every((entry) => table.some((row) => same(entry, row))));
    const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const escaped = launch.profile.replaceAll("'", "''");
    const script = `$ErrorActionPreference='Stop';$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${browserPid}' -Property CommandLine;$s='${escaped}';ConvertTo-Json -Compress @{matches=($p.CommandLine.Contains('--user-data-dir='+$s) -or $p.CommandLine.Contains('--user-data-dir="'+$s+'"'))}`;
    const native = childProcess.spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { encoding: 'utf8', windowsHide: true, timeout: 120000 });
    assert.equal(native.status, 0, native.stderr);
    assert.equal(JSON.parse(native.stdout).matches, true, 'native command line binds the CDP browser root to the positively created profile');
    owned = { pid: root.pid, createdAt: root.createdAt, launcherPid: launch.launcherPid,
      profile: path.basename(launch.profile), profileIdentity: profiles.get(launch.profile) };
    console.log(`C022 OWNED BROWSER ${JSON.stringify(owned)}`);
    return { ...session, close };
  } catch (error) {
    try { await close(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'browser proof and own cleanup both failed'); }
    throw error;
  }
}

module.exports = Object.freeze({ openOwnedLoopback });
