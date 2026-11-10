'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { verify } = require('./final-browser-imports.cjs');
const REPOSITORY = path.resolve(__dirname, '..', '..', '..');
const runtime = path.join(REPOSITORY, '.git', 'kanban-orchestrator', 'browser-runtime');
const { openLoopbackScratchSession } = require(path.join(REPOSITORY, 'testing', 'browser', 'lifecycle', 'scratch-session.cjs'));
const { createOwnedAdapters } = require(path.join(REPOSITORY, 'testing', 'browser', 'lifecycle', 'owned.cjs'));
const scope = new AsyncLocalStorage();
const creations = new Map();
const identity = (file) => {
  const stat = fs.lstatSync(file, { bigint: true });
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
};
const record = (owner, file) => {
  if (owner && typeof file === 'string' && path.dirname(file) === runtime) creations.set(file, { owner, identity: identity(file) });
};
const originalMkdtemp = fs.mkdtemp;
const originalPromiseMkdtemp = fs.promises.mkdtemp;
fs.mkdtemp = function (...args) {
  const owner = scope.getStore();
  const callback = args.at(-1);
  if (typeof callback === 'function') args[args.length - 1] = function (error, file) { if (!error) record(owner, file); return callback.apply(this, arguments); };
  return originalMkdtemp.apply(this, args);
};
fs.promises.mkdtemp = async function (...args) {
  const owner = scope.getStore();
  const file = await originalPromiseMkdtemp.apply(this, args);
  record(owner, file);
  return file;
};

async function openOwnedLoopback(anchor, server) {
  assert.deepEqual(verify(), [], 'the eight owning API files, sealed helper and qualifier match their immutable import anchor');
  const owner = {};
  const adapters = createOwnedAdapters();
  let session;
  let protocol;
  let rootIdentity;
  let profile;
  try {
    session = await scope.run(owner, () => openLoopbackScratchSession(anchor, server, { deadlineMs: 180000, listMs: 60000, terminateMs: 120000, scratchTimeoutMs: 10000 }));
    const browser = session.page.context().browser();
    protocol = await browser.newBrowserCDPSession();
    const info = await protocol.send('SystemInfo.getProcessInfo');
    const roots = info.processInfo.filter((entry) => entry.type === 'browser');
    assert.equal(roots.length, 1, 'one browser root authenticated by this owned CDP channel');
    const pid = roots[0].id;
    const first = (await adapters.list({ timeoutMs: 60000 })).find((entry) => entry.pid === pid);
    assert.ok(first && /^\d+$/.test(first.createdAt), 'the authenticated root has a native creation identity');
    const args = (await protocol.send('Browser.getBrowserCommandLine')).arguments;
    const profiles = args.filter((arg) => arg.startsWith('--user-data-dir='));
    assert.equal(profiles.length, 1);
    profile = profiles[0].slice('--user-data-dir='.length);
    const created = creations.get(profile);
    assert.ok(created && created.owner === owner, 'profile ownership is this invocation successful mkdtemp, not a name or directory difference');
    assert.deepEqual(identity(profile), created.identity);
    const confirmed = (await adapters.list({ timeoutMs: 60000 })).find((entry) => entry.pid === pid);
    assert.ok(confirmed && confirmed.createdAt === first.createdAt && browser.isConnected(), 'native creation identity is stable across the authenticated profile read');
    rootIdentity = { pid, createdAt: first.createdAt };
  } catch (error) {
    const failures = [error];
    if (protocol) try { await protocol.detach(); } catch (cleanup) { failures.push(cleanup); }
    if (session) try { await session.close(); } catch (cleanup) { failures.push(cleanup); }
    throw failures.length === 1 ? error : new AggregateError(failures, 'owned browser initialization and cleanup failed');
  }
  let closing;
  return {
    page: session.page, browserVersion: session.browserVersion,
    close() {
      if (!closing) closing = (async () => {
        const failures = [];
        try { await protocol.detach(); } catch (error) { failures.push(error); }
        let report;
        try { report = await session.close(); } catch (error) { failures.push(error); }
        if (failures.length) throw new AggregateError(failures, 'owned protocol and browser close errors are retained');
        assert.equal(report.clean, true, 'the owning API confirmed process and scratch end state');
        assert.equal(report.process.confirmed, true);
        const after = await adapters.list({ timeoutMs: 60000 });
        assert.ok(!after.some((entry) => entry.pid === rootIdentity.pid && entry.createdAt === rootIdentity.createdAt), 'only this authenticated PID/creation identity is checked for absence');
        assert.equal(fs.existsSync(profile), false, 'this invocation profile is absent after its sealed close');
        for (const file of session.scratchPaths()) assert.equal(fs.existsSync(file), false, 'this invocation recorded scratch is absent');
        console.log(`PASS owned browser cleanup: ${JSON.stringify({ clean: true, authenticatedRoot: rootIdentity, ownedProfilesAbsent: 1, pageClosed: session.page.isClosed() })}`);
        return report;
      })();
      return closing;
    }
  };
}
module.exports = { openOwnedLoopback };
